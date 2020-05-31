import config from '@mmstudio/config';
import { Router } from 'express';
import { inlineSource as inline } from 'inline-source';
import JsreportPhantomPdf from 'jsreport-phantom-pdf';
import JsReport from 'jsreport-core';
import { getLogger } from 'log4js';
import page, { ICommonParams } from './_page';

const logger = getLogger();

type Orientation = 'portrait' | 'landscape';

interface IQuery {
	attachment: string;
	height: string;
	orientation: Orientation;
	width: string;
}

async function html2pdf(html: string, orientation: Orientation, width: string, height: string) {
	const jsreport = JsReport();
	jsreport.use(JsreportPhantomPdf({
		allowLocalFilesAccess: true
	}));
	const content = await inline(html, {
		compress: true,
		rootpath: config.cwd
	});
	await jsreport.init();
	const resp = await jsreport.render({
		template: {
			phantom: {
				height,
				width,
				orientation
			},
			content,
			engine: 'none',
			recipe: 'phantom-pdf'
		}
	});
	return resp.content;
}

export default function pdf(router: Router) {
	router.get('/*.pdf', async (req, res) => {
		const headers = req.headers;
		const actionid = headers.actionid as string;
		const tm = new Date().getTime();
		const url = req.url;
		const body = req.body as Record<string, unknown>;
		logger.info(`Request:${url},actionid=${actionid}`);
		try {
			const page_name = decodeURIComponent(/.*\/(.*?)\.pdf/.exec(url)![1]);
			const msg = {
				params: req.params,
				query: req.query,
				url,
				...body
			} as ICommonParams;
			const ret = await page(page_name, url, msg, actionid);
			logger.debug(`Response:${page_name},actionid=${actionid}, and ${new Date().getTime() - tm}ms cost.`);
			if (!ret) {
				res.status(404).end();
				return;
			}
			const tm1 = new Date().getTime();
			logger.debug(`Start converting to pdf:${page_name},actionid=${actionid}`);
			const { attachment, height, orientation, width } = req.query as unknown as IQuery;
			const data = await html2pdf(ret, orientation, width, height);
			logger.debug(`Finish converting to pdf:${page_name},actionid=${actionid}, and ${new Date().getTime() - tm1}ms cost.`);
			res.contentType('application/pdf');
			if (attachment) {
				res.attachment(attachment);
			}
			res.send(data);
		} catch (err) {
			const e = err as Error;
			logger.trace(e);
			const err_msg = e.message || e.toString();
			logger.error(`Failling render pdf page:${url}. ${err_msg}, and ${new Date().getTime() - tm}ms cost. actionid=${actionid}.`);
			res.contentType('application/json');
			res.status(500).end(err_msg);
		}
	});
	return router;
}
