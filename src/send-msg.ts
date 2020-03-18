import { getLogger } from 'log4js';
import invoke from '@mmstudio/invoke';

const logger = getLogger();

export interface IWebResult {
	data: Buffer | unknown;
	cookie?: { [name: string]: string } | null;
	content_type?: string;
	headers?: {
		[key: string]: string[];
	};
	attachment?: string;
	redirect?: string;
	status_code?: number;
}

export default async function send_msg(service: string, msg: unknown, actionid: string) {
	const data = await invoke<IWebResult>(service, msg, actionid);
	if (Buffer.isBuffer(data.data)) {
		logger.debug(`res=Blob Data.actionid=${actionid}`);
		if (!data.content_type) {
			data.content_type = 'application/octet-stream';
		}
		return data;
	}
	const str = JSON.stringify(data);
	logger.debug(`res=${str}.actionid=${actionid}`);
	return data;
}
