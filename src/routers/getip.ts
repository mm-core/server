import { Router } from 'express';
import { getLogger } from 'log4js';

const logger = getLogger();

export default function getip(router: Router) {
	router.get('/getip', (req, res) => {
		const headers = req.headers;
		const actionid = headers.actionid as string;
		const tm = new Date().getTime();
		const url = req.url;
		logger.info(`Request:${url},actionid=${actionid}`);
		try {
			const ip = req.headers['x-real-ip'] || req.connection.remoteAddress;
			logger.debug(`Response:${url}, ip=${ip}, actionid=${actionid}, and ${new Date().getTime() - tm}ms cost.`);
			res.send(ip);
		} catch (e) {
			logger.trace(e);
			const err_msg = (e as Error).message || e.toString();
			logger.error(`Failling getip. ${err_msg}, and ${new Date().getTime() - tm}ms cost. actionid=${actionid}.`);
			res.contentType('application/json');
			res.status(500).end(err_msg);
		}
	});
	return router;
}
