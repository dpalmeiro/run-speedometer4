.PHONY: build test dev install clean

build:
	npm run build

test:
	npm test

dev:
	npm run dev

install: build
	npm link

clean:
	rm -rf dist
