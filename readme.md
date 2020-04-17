# Webserver

This is a web server for local development and deploy.

## 部署

安装

```sh
yarn add @mm-works/p000001
```

启动

```sh
./node_moduels/.bin/mm-server
```

## 配置

配置文件`mm.json`,主要配置端口，数据库服务

```json
{
	"port": 8889,
	"timeout": 500000,
	"acma": 150000,
	"max_file_size": 53687091200,
	"minio": {
		"endPoint": "127.0.0.1",
		"port": 9000,
		"accessKey": "mmstudio",
		"secretKey": "Mmstudio123",
		"useSSL": false,
		"region": "cn-north-1",
		"partSize": 5242880
	},
	"redis": {
		"url": "redis://127.0.0.1:6379",
		"expiration": 20000
	},
	"dbs": {
		"sys": {
			"type": "postgres",
			"source": "postgres://mmstudio:Mmstudio111111@127.0.0.1:5432/feidao"
		},
		"prj001": {
			"type": "mariadb",
			"source": "mysql://mmstudio:Mmstudio111111@127.0.0.1:3306/feidao?connectionLimit=5"
		}
	}
}
```
