clean-tick:
	rm -rf node_modules

install-node:
	npm install lang/node/ --prefix ./lang/node

install-tick:
	npm install

tick-node:
	./tools/tick-cluster.js -n 10 -i node lang/node/main.js

update-all:
	git submodule foreach git pull origin master
