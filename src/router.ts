import config from '@mmstudio/config';
import { Router } from 'express';
import cross_domain from './routers/cross-domain';
import docx from './routers/docx';
import file from './routers/file';
import html from './routers/html';
import pdf from './routers/pdf';
import project from './routers/project';
import send_msg from './routers/send-msg';
import wx from './routers/wx';
import xlsx from './routers/xlsx';

export default function create_router() {
	// import redisStore from './redis';
	const router = Router() as Router;
	// router.use(compression());
	// 1.(根据配置)设置跨域访问
	cross_domain(router);

	// 2 微信
	if (config.wx) {
		wx(router);
	}

	// 3. send-msg
	send_msg(router);

	// 4. file download and upload
	file(router);

	// 5 all_custom_routers
	project(router);

	// 6 页面渲染
	html(router);

	// 7 word文档
	docx(router);

	// 8 pdf文档
	pdf(router);

	// 9 excel表格
	xlsx(router);

	return router;
}
