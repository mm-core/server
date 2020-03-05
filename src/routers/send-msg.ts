import { Router } from 'express';
import { getLogger } from 'log4js';
import send_msg from '../send-msg';
import set_response from '../res';

const logger = getLogger();

export default function proxy_msg(router: Router) {
	router.post('/sendmessage/:service', async (req, res) => {
		const msg = req.body;
		const headers = req.headers;
		const actionid = headers.actionid as string;
		const tm = new Date().getTime();
		const urls = {
			base: req.baseUrl,
			origin: req.originalUrl,
			url: req.url
		};
		const m = JSON.stringify(req.body);
		logger.info(`Request:${m},actionid=${actionid}`);
		const cookie = req.cookies;
		const params = req.params;
		const query = req.query;
		try {
			const data = {
				cookie,
				// data,
				// headers,
				params,
				query,
				urls,
				...msg
			};
			const ret = await send_msg(params.service, data, actionid);
			if (ret) {
				set_response(res, ret, m, actionid, tm);
			} else {
				logger.error(`Service:${params.service} is not exist. actionid=${actionid}, msg=${msg}`);
				res.sendStatus(500);
			}
		} catch (e) {
			const err_msg = (e as Error).message || e.toString();
			logger.error(`Failling proxy message. ${err_msg}, and ${new Date().getTime() - tm}ms cost. actionid=${actionid}.`);
			res.contentType('application/json');
			res.status(500).end(err_msg);
		}
	});
	return router;
}
