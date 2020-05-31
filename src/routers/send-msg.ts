import { Router } from 'express';
import { getLogger } from 'log4js';
import send_msg from '../send-msg';
import set_response from '../res';

const logger = getLogger();

export default function proxy_msg(router: Router) {
	router.post('/sendmessage/:service', async (req, res) => {
		const body = req.body as Record<string, unknown>;
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
		const params = req.params;
		const query = req.query;
		try {
			const data = {
				params,
				query,
				urls,
				...body
			};
			const ret = await send_msg(params.service, data, actionid);
			set_response(res, ret, m, actionid, tm);
		} catch (err) {
			const e = err as Error;
			const err_msg = e.message || e.toString();
			logger.error(`Failling proxy message. ${err_msg}, and ${new Date().getTime() - tm}ms cost. actionid=${actionid}.`);
			res.contentType('application/json');
			res.status(500).end(err_msg);
		}
	});
	return router;
}
