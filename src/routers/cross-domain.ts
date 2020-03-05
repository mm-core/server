import config from '@mmstudio/config';
import { Router } from 'express';

export default function cross_domain(router: Router) {
	if (config.acao) {
		router.use((req, res, next) => {
			const acao = config.acao === '*' ? req.headers.origin as string : config.acao;
			res.header('Access-Control-Allow-Origin', acao);
			res.header('Access-Control-Allow-Headers', 'content-type, x-requested-with');
			// res.header('Access-Control-Allow-Methods', 'PUT,POST,GET,DELETE,OPTIONS');
			res.header('Access-Control-Allow-Methods', 'POST,GET');
			res.header('Access-Control-Allow-Credentials', 'true');
			if (config.acma) {
				res.header('Access-Control-Max-Age', config.acma.toString());	// optons请求有效时间
			}
			// res.setHeader('P3P', 'CP=CAO PSA OUR');
			// res.setHeader('P3P', 'CP=CURa ADMa DEVa PSAo PSDo OUR BUS UNI PUR INT DEM STA div COM NAV OTC NOI DSP COR');
			return next();
		});
	}
	return router;
}
