import { Response } from 'express';
import { getLogger } from 'log4js';
import { IWebResult } from './send-msg';

const logger = getLogger();

export default function set_response(res: Response, ret: IWebResult, msg: string, actionid: string, start: number) {
	const retstr = Buffer.isBuffer(ret.data) ? 'Blob' : JSON.stringify(ret);
	logger.info(`Response:${retstr}. Request:${msg},actionid=${actionid}, ${new Date().getTime() - start} ms cost.`);
	if (ret.status_code) {
		res.status(ret.status_code);
	}
	if (ret.headers) {
		for (const name in ret.headers) {
			if (name) {
				res.setHeader(name, ret.headers[name]);
			}
		}
	}
	res.contentType(ret.content_type || 'application/json');
	if (ret.cookie) {
		const ck = ret.cookie;
		Object.keys(ret.cookie).forEach((key) => {
			const val = ck[key];
			if (val === null) {
				res.clearCookie(key);
			} else {
				res.cookie(key, ck[key], {
					httpOnly: true
				});
			}
		});
	}
	if (ret.redirect) {
		res.redirect(ret.redirect);
		return;
	}
	if (ret.attachment) {
		res.attachment(ret.attachment);
	}
	if (ret.data) {
		res.send(ret.data);
	}
}
