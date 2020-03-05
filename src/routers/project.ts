import config from '@mmstudio/config';
import { Router } from 'express';
import { getLogger } from 'log4js';
import send_msg from '../send-msg';
import set_response from '../res';

const logger = getLogger();

export default function project(router: Router) {
	// 3 all_custom_routers
	const routers = config.routers || [];
	routers.forEach((r) => {
		logger.info(`start listening: ${r.url}`);
		router[r.method](r.url, async (req, res) => {
			const headers = req.headers;
			const actionid = headers.actionid as string;
			const urls = {
				base: req.baseUrl,
				origin: req.originalUrl,
				url: req.url
			};
			logger.info(`URL:${req.url}, actionid=${actionid}`);
			const tm = new Date().getTime();
			const body = req.body;
			logger.debug('message body:', body);
			const cookie = req.cookies;
			const params = req.params;
			const query = req.query;
			try {
				const data = {
					cookie,
					// headers,
					params,
					query,
					urls,
					...r.data,
					...body
				};
				const msg = JSON.stringify(data);
				logger.info(`Request:${msg},actionid=${actionid}`);
				const ret = await send_msg(r.service, data, actionid);
				if (ret) {
					set_response(res, ret, msg, actionid, tm);
				} else {
					logger.error(`Service:${r.service} should return something. actionid=${actionid}, msg=${msg}`);
					res.sendStatus(500);
				}
			} catch (e) {
				const err_msg = (e as Error).message || e.toString();
				logger.error(`Failling proxy message. ${err_msg}, and ${new Date().getTime() - tm}ms cost. actionid=${actionid}.`);
				res.contentType('application/json');
				res.status(500).end(err_msg);
			}
		});
	});
}
