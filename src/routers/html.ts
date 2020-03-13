import { Router } from 'express';
import { getLogger } from 'log4js';
import page from './_page';

const logger = getLogger();

export default function html(router: Router) {
	router.get('/*.html?', async (req, res) => {
		const headers = req.headers;
		const actionid = headers.actionid as string;
		const tm = new Date().getTime();
		const url = req.url;
		const body = req.body;
		logger.info(`Request:${url},actionid=${actionid}`);
		try {
			const page_name = decodeURIComponent(/.*\/(.*?)\.html?/.exec(url)![1]);
			const msg = {
				params: req.params,
				query: req.query,
				url,
				...body
			};
			const ret = await page(page_name, url, msg, actionid);
			logger.debug(`Response:${page_name}, actionid=${actionid},and ${new Date().getTime() - tm}ms cost.`);
			if (!ret) {
				res.status(404).end();
				return;
			}
			res.send(ret);
		} catch (e) {
			console.trace(e);
			logger.trace(e);
			const err_msg = (e as Error).message || e.toString();
			logger.error(`Failling render page:${url}. ${err_msg}, and ${new Date().getTime() - tm}ms cost. actionid=${actionid}.`);
			res.contentType('application/json');
			res.status(500).end(err_msg);
		}
	});
	return router;
}
