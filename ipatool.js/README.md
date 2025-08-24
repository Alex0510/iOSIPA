# 代码参考来源灰佬源码
https://github.com/wf021325/ipatool.js


## 功能支持电脑及iOS手机
灰佬源码只有下载ipa功能，没有查询版本号，和购买功能
本源码新增支持购买获取软件许可，及查询历史版本号功能

下载【新版、旧版、包含已经下架的新旧版APP】，前提是自己曾经下载过


### 用法

测试环境：windows   iOS可使用python3ide   Node.js 18.16.1
 
 安装模块
```js
npm i
```

- win编辑main.js 然后运行批处理即可

或者运行以下命令(win/mac/linux)

```js
node main.js //购买及下载
node src/history.js 234567 //app软件ID
```


