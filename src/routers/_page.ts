import { IncomingHttpHeaders } from 'http';
import { promises } from 'fs';
import path from 'path';
import { getLogger } from 'log4js';
import config from '@mmstudio/config';

const { access } = promises;
const logger = getLogger();

export interface ICommonParams {
	cookie: {
		[name: string]: string;
	};
	headers: IncomingHttpHeaders;
	params: unknown;
	query: unknown;
	url: string;
}

interface IService {
	default(url: string, msg: unknown, headers: { actionid: string }): Promise<string>;
}

export default async function page(page_name: string, url: string, msg: ICommonParams, actionid: string) {
	logger.debug(`File_name:${page_name}, actionid=${actionid}`);
	const headers = { actionid };
	logger.debug(`Try get file in dist. page:${page_name}, actionid=${actionid}`);
	const fullpath = path.join(config.cwd, 'dist', page_name, 'n');
	if (require.cache[fullpath]) {
		if (config.debug) {
			delete require.cache[fullpath];
		}
	} else {
		try {
			await access(`${fullpath}.js`);
		} catch (error) {
			return null;
		}
	}
	// eslint-disable-next-line import/no-dynamic-require
	return (require(fullpath) as IService).default(url, msg, headers);
}
