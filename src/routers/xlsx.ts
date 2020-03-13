import config from '@mmstudio/config';
import { Router } from 'express';
import { inlineSource as inline } from 'inline-source';
import JsReport from 'jsreport-core';
import JsreportHtml2Xlsx from 'jsreport-html-to-xlsx';
import JsreportXlsx from 'jsreport-xlsx';
import { getLogger } from 'log4js';
import page from './_page';

const logger = getLogger();

async function html2xlsx(html: string) {
	const jsreport = JsReport();
	jsreport.use(JsreportXlsx());
	jsreport.use(JsreportHtml2Xlsx());

	const content = await inline(html, {
		compress: true,
		rootpath: config.cwd
	});
	await jsreport.init();
	const resp = await jsreport.render({
		template: {
			content,
			engine: 'none',
			recipe: 'html-to-xlsx'
		}
	});
	return resp.content;
}

export default function xlsx(router: Router) {
	router.get('/*.xlsx', async (req, res) => {
		const headers = req.headers;
		const actionid = headers.actionid as string;
		const tm = new Date().getTime();
		const url = req.url;
		const body = req.body;
		logger.info(`Request:${url},actionid=${actionid}`);
		try {
			const page_name = decodeURIComponent(/.*\/(.*?)\.xlsx/.exec(url)![1]);
			const msg = {
				params: req.params,
				query: req.query,
				url,
				...body
			};
			const ret = await page(page_name, url, msg, actionid);
			logger.info(`Response:${page_name},actionid=${actionid}, and ${new Date().getTime() - tm}ms cost.`);
			if (!ret) {
				res.status(404).end();
				return;
			}
			const tm1 = new Date().getTime();
			logger.info(`Start converting to xlsx:${page_name},actionid=${actionid}`);
			const data = await html2xlsx(ret);
			logger.info(`Finish converting to xlsx:${page_name},actionid=${actionid}, and ${new Date().getTime() - tm1}ms cost.`);
			res.contentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
			const attachment = (req.query as { attachment: string }).attachment;
			if (attachment) {
				res.attachment(attachment);
			}
			res.send(data);
		} catch (e) {
			logger.trace(e);
			const err_msg = (e as Error).message || e.toString();
			logger.error(`Failling render xlsx page:${url}. ${err_msg}, and ${new Date().getTime() - tm}ms cost. actionid=${actionid}.`);
			res.contentType('application/json');
			res.status(500).end(err_msg);
		}
	});
	return router;
}
