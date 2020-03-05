import config from '@mmstudio/config';
import { Router } from 'express';
import { getLogger } from 'log4js';
import send_msg from './send-msg';
import set_response from './res';

const logger = getLogger();

export default function project() {
	const router = Router() as Router;
	// all_custom_filters
	const routers = config.filters || [];
	routers.forEach((r) => {
		logger.info(`start listening: ${r.url}`);
		router[r.method](r.url, async (req, res, next) => {
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
					if (!ret.data) {
						next();
					}
				} else {
					next();
				}
			} catch (e) {
				const err_msg = (e as Error).message || e.toString();
				logger.error(`Failling proxy message. ${err_msg}, and ${new Date().getTime() - tm}ms cost. actionid=${actionid}.`);
				res.status(500).end(err_msg);
			}
		});
	});
	return router;
}
