@kirei/hmr-api
==========================

[![GitHub Workflow Status](https://img.shields.io/github/workflow/status/ifaxity/kirei/Test%20and%20Deploy?style=for-the-badge&logo=github)](https://github.com/iFaxity/kirei/actions)
[![Codecov](https://img.shields.io/codecov/c/github/ifaxity/kirei?style=for-the-badge&logo=codecov)](https://codecov.io/gh/iFaxity/kirei)
[![Codacy grade](https://img.shields.io/codacy/grade/dbdf69a34ba64733ace9d8aa204248ab?style=for-the-badge&logo=codacy)](https://app.codacy.com/manual/iFaxity/kirei/dashboard)
[![Codacy coverage](https://img.shields.io/codacy/coverage/dbdf69a34ba64733ace9d8aa204248ab?style=for-the-badge&logo=codacy)](https://app.codacy.com/manual/iFaxity/kirei/dashboard)
[![npm (scoped)](https://img.shields.io/npm/v/@kirei/hmr-api?style=for-the-badge&logo=npm)](https://npmjs.org/package/@kirei/hmr-api)
[![npm bundle size (scoped)](https://img.shields.io/bundlephobia/min/@kirei/hmr-api?label=Bundle%20size&style=for-the-badge)](https://npmjs.org/package/@kirei/hmr-api)
[![npm bundle size (scoped)](https://img.shields.io/bundlephobia/minzip/@kirei/hmr-api?label=Bundle%20size%20%28gzip%29&style=for-the-badge)](https://npmjs.org/package/@kirei/hmr-api)

Hot Module Replacement API for Kirei Component. This only includes the API and does not offer any automatic instrumentation. Consider using the babel plugin instead (babel-plugin-kirei).

Installation
--------------------------
`npm i @kirei/hmr-api`

or if you use yarn

`yarn add @kirei/hmr-api`

API
--------------------------

```js
import * as hmr from '@kirei/hmr-api';
```

### [hmr.create( filename, opts )](#create)

Solely creates a new component, if component already exists, it will return its constructor.

**Returns:** Component constructor

**Parameters:**
* `filename {string}` - Filename where component was defined
* `opts {ComponentOptions}` - Options to define component with

### [hmr.update( filename, opts )](#update)

Updates element options and all of its instances.

**Returns:** Component constructor

**Parameters:**
* `filename {string}` - Filename where component was defined
* `opts {ComponentOptions}` - Options to update component with

### [hmr.createOrUpdate( filename, opts )](#createOrUpdate)

Stores a component to cache or updates it and all of its active instances

**Returns:** Component constructor

**Parameters:**
* `filename {string}` - Filename where component was defined
* `opts {ComponentOptions}` - Options to update

### [hmr.has( filename, opts )](#has)

Checks if HMR already has component with the same id stored.

**Returns:** True if instance is already in the cache.

**Parameters:**
* `filename {string}` - Filename where component was defined
* `opts {ComponentOptions}` - Component options

License
--------------------------

[MIT](./LICENSE)
