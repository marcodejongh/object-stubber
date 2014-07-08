var _ = require('lodash');
var test = require('./lib/object-stubber');
var fs = require('fs');


console.log(_.keys(test));

console.log(test.generateStubJsCode(_));
