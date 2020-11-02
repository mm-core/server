import http from 'http';
import { tmpdir } from 'os';
import { join } from 'path';
import config from '@mmstudio/config';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import errorhandler from 'errorhandler';
import express from 'express';
import formData from 'express-form-data';
import { getLogger } from 'log4js';
import serveFavicon from 'serve-favicon';
import { v4 as uuid } from 'uuid';
import router from './router';
import filters from './filters';

const logger = getLogger();

export default function start() {
	const app = express();

	app.use(cookieParser());

	app.use(errorhandler({
		log: true
	}));

	app.use((_req, res, next) => {
		// 通过设置"X-Content-Type-Options: nosniff"响应标头，对 script 和 styleSheet 在执行是通过MIME 类型来过滤掉不安全的文件
		res.header('X-Content-Type-Options', 'nosniff always');
		res.header('X-XSS-Protection', '1; mode=block always');
		res.header('X-Frame-Options', 'DENY');	// DENY：不能被嵌入到任何iframe或者frame中。 SAMEORIGIN：页面只能被本站页面嵌入到iframe或者frame中 uri：只能被嵌入到指定域名的框架中
		res.header('Strict-Transport-Security', '"max-age=3600; includeSubDomains" always');
		// res.header('Content-Security-Policy', 'referrer no-referrer|no-referrer-when-downgrade|origin|origin-when-cross-origin|unsafe-url');	// referrer no-referrer|no-referrer-when-downgrade|origin|origin-when-cross-origin|unsafe-url
		res.header('Referrer-Policy', 'same-origin');
		next();
	});

	// parse application/x-www-form-urlencoded
	app.use(bodyParser.urlencoded({
		extended: false,
		limit: config.max_file_size
	}));
	// parse application/json
	app.use(bodyParser.json({
		limit: config.max_file_size,
		type: '*/json'
	}));
	// parse an HTML body into a string
	app.use(bodyParser.text({
		type: 'text/html'
	}));

	// app.use(compression());

	// parse data with connect-multiparty.
	app.use(formData.parse({
		autoClean: true,
		uploadDir: tmpdir()
	}));
	// delete from the request all empty files (size == 0)
	app.use(formData.format());
	// union the body and the files
	app.use(formData.union());

	// 1. append realip into body 2. append actionid to header
	app.use((req, res, next) => {
		if (!req.body) {
			req.body = {};
		}
		const headers = req.headers as Record<string, string>;
		const actionid = headers.actionid || uuid();
		headers.actionid = actionid;
		res.setHeader('actionid', actionid);
		const ip = headers['x-real-ip'] || headers['x-forwarded-for'] || // 判断是否有反向代理 IP
			req.connection.remoteAddress || // 判断 connection 的远程 IP
			req.socket.remoteAddress; // 判断后端的 socket 的 IP
		const body = req.body as { realip: string | undefined; cookies: unknown; headers: Record<string, string>; };
		body.realip = ip;
		body.cookies = req.cookies as Record<string, string>;
		body.headers = headers;
		next();
	});

	app.use(filters());

	app.use('/', express.static(config.cwd));

	app.use(router());

	app.use(serveFavicon(join(config.cwd, 'favicon.ico')));

	const port = config.port;
	try {
		const server = http.createServer(app);
		server.listen(port);
		logger.warn(`http server started at port:${port}`);
	} catch (e) {
		logger.error(`create http server at port: ${port} failed`);
		logger.error((e as Error).message);
	}
}
