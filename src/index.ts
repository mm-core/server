#!/usr/bin/env node

import { configure, getLogger } from 'log4js';
import server from './server';

configure('./log4js.json');
const logger = getLogger();
logger.warn('begin to start http server...');

process.on('uncaughtException', (err) => {
	logger.error('===============uncaughtException start===================');
	logger.error('uncaughtException:', err && err.toString());
	logger.error('===============uncaughtException end===================');
});

process.on('SIGINT', () => {
	process.nextTick(() => {
		process.exit(0);
	});
});

server();
