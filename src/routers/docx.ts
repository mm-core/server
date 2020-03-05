import config from '@mmstudio/config';
import { Router } from 'express';
import { inlineSource as inline } from 'inline-source';
import JsReport from 'jsreport-core';
import JsreportHtml2docx from 'jsreport-html-embedded-in-docx';
import { getLogger } from 'log4js';
import page from './_page';

const logger = getLogger();

async function html2docx(html: string) {
	const jsreport = JsReport();
	jsreport.use(JsreportHtml2docx());

	const content = await inline(html, {
		compress: true,
		rootpath: config.cwd
	});
	await jsreport.init();
	const resp = await jsreport.render({
		template: {
			content,
			engine: 'none',
			recipe: 'html-embedded-in-docx'
		}
	});
	return resp.content;
}

export default function docx(router: Router) {
	router.get('/*.docx', async (req, res) => {
		const headers = req.headers;
		const actionid = headers.actionid as string;
		const tm = new Date().getTime();
		const url = req.url;
		logger.info(`Request:${url},actionid=${actionid}`);
		try {
			const page_name = decodeURIComponent(/.*\/(.*?)\.docx/.exec(url)![1]);
			const msg = {
				cookie: req.cookies,
				headers: req.headers,
				params: req.params,
				query: req.query,
				url
			};
			const ret = await page(page_name, url, msg, actionid);
			logger.debug(`Response:${page_name},actionid=${actionid}, and ${new Date().getTime() - tm}ms cost.`);
			if (!ret) {
				res.status(404).end();
				return;
			}
			const tm1 = new Date().getTime();
			logger.debug(`Start converting to docx:${page_name},actionid=${actionid}`);
			const data = await html2docx(ret);
			logger.debug(`Finish converting to docx:${page_name},actionid=${actionid}, and ${new Date().getTime() - tm1}ms cost.`);
			res.contentType('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
			const attachment = (req.query as { attachment: string }).attachment;
			if (attachment) {
				res.attachment(attachment);
			}
			res.send(data);
		} catch (e) {
			logger.trace(e);
			const err_msg = (e as Error).message || e.toString();
			logger.error(`Failling render docx page:${url}. ${err_msg}, and ${new Date().getTime() - tm}ms cost. actionid=${actionid}.`);
			res.contentType('application/json');
			res.status(500).end(err_msg);
		}
	});
	return router;
}
