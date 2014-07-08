/*
 * object-stubber
 * https://github.com/marcodejongh/object-stubber
 *
 * Copyright (c) 2014 Marco de Jongh
 * Licensed under the MIT license.
 */

'use strict';
(function (exports) {
  var functionReplacementStr = "function emptyFn () {}";

  /**
   * Holds validation functions for class functions.
   *
   * @property {Object} validate
   */
  var validate = {

    /**
     * Validate function arguments
     *
     * @method validate.stubPackages
     */
    stubPackages: function (options) {
      if ('string' != typeof options.outfile) {
        throw new Error("[PackageStubber.stubPackages] If supplied, the " +
            "'outfile' field must be the path to a file to write " +
            "stub output to.  It can be an absolute path or " +
            "relative to the current Meteor application")
      }
      if (typeof options.dontStub !== 'string' &&
          !_.isArray(options.dontStub)) {
        throw new Error("[PackageStubber.stubPackages] If supplied, the " +
            "'dontStub' field must be the name of a package or an " +
            "array of package names")
      }
    },

    /**
     * Validate function arguments
     *
     * @method validate.deepCopyReplaceFn
     */
    deepCopyReplaceFn: function (target, fnPlaceholder) {
      if (null === target ||
          'object' !== typeof target) {
        throw new Error("[PackageStubber.deepCopyReplaceFn] Required field `target` " +
            "must be an object")
      }
      if (null !== fnPlaceholder &&
          'undefined' !== typeof fnPlaceholder &&
          'string' !== typeof fnPlaceholder) {
        throw new Error("[PackageStubber.deepCopyReplaceFn] If supplied, the " +
            "'fnPlaceholder' field must be a string")
      }
    }

  };  // end validate

  /**
   * Performs a deep copy of the target object, replacing all function fields
   * with a string placeholder.
   *
   * @method deepCopyReplaceFn
   * @param {Object} target The object that will be stubbed.
   * @param {String} [fnPlaceholder] string to use in place of any function
   *                 fields.  Default: "FUNCTION_PLACEHOLDER"
   * @return {Object} new object, with all functions replaced with the
   *                  fnPlaceholder string
   */
  var deepCopyReplaceFn = exports.deepCopyReplaceFn = function (target, fnPlaceholder) {
    var dest = {},
        fieldName,
        type

    validate.deepCopyReplaceFn(target, fnPlaceholder)

    fnPlaceholder = fnPlaceholder || "FUNCTION_PLACEHOLDER"

    for (fieldName in target) {
      type = typeof target[fieldName]
      switch (type) {
        case "number":
          dest[fieldName] = target[fieldName]
          break;
        case "string":
          dest[fieldName] = target[fieldName]
          break;
        case "function":
          dest[fieldName] = fnPlaceholder;
          break;
        case "object":
          if (target[fieldName] === null) {
            dest[fieldName] = null
          } else if (target[fieldName] instanceof Date) {
            dest[fieldName] = new Date(target[fieldName])
          } else {
            dest[fieldName] = deepCopyReplaceFn(
                target[fieldName],
                fnPlaceholder)
          }
          break;
      }
    }

    return dest
  };  // end deepCopyReplaceFn




  /**
   * Neither JSON.stringify() nor .toString() work for functions so we "stub"
   * functions by:
   *   1. replacing them with a placeholder string
   *   2. `JSON.stringify`ing the resulting object
   *   3. converting placeholders to empty function code in string form
   *
   * We need to do the string replacement in two steps because otherwise the
   * `JSON.stringify` step would escape our functions incorrectly.
   *
   * @method _replaceFnPlaceholders
   * @param {String} str String to convert
   * @param {String} [placeHolder] string to replace.
   *                 Default: "FUNCTION_PLACEHOLDER"
   * @param {String} [replacement] replacement for placeholder strings.
   *                 Default: PackageStubber.functionReplacementStr
   * @return {String} string with all placeholder strings replaced
   *                  with `PackageStubber.functionReplacementStr`
   */
  function _replaceFnPlaceholders (str, placeholder, replacement) {
    var regex

    placeholder = placeholder || '"FUNCTION_PLACEHOLDER"'
    replacement = replacement || functionReplacementStr

    regex = new RegExp(placeholder, 'g')

    return str.replace(regex, replacement);
  };  // end _replaceFnPlaceholders

  /**
   * Creates a stub of the target object or function.  Stub is in the form
   * of js code in string form which, when executed, builds the stubs in
   * the then-current global context.
   *
   * Useful when auto-stubbing Meteor packages and then running unit tests
   * in a new, Meteor-free context.
   *
   * @method generateStubJsCode
   * @param {Any} target Target to stub
   * @param {String} name Name thing to stub for use in reporting errors
   * @param {String} package Name of target package for use in errors
   * @return {String} Javascript code in string form which, when executed,
   *                  builds the stub in the then-current global context
   */
  exports.generateStubJsCode = function (target, name, packageName) {
    var typeOfTarget = typeof target,
        stubGenerator

    if (null === target) {
      // handle null special case since it has type "object"
      return "null"
    }

    // dispatch to generator function based on type of target

    stubGenerator = stubGenerators[typeOfTarget]

    if (!stubGenerator) {
      throw new Error("[PackageStubber] Could not stub package export '" +
          name + "' in package '" + packageName + "'.  Missing stub " +
          "generator for type", typeOfTarget)
    }

    return stubGenerator(target, name, packageName)

  };  // end generateStubJsCode


  var stubGenerators = {
    /**
     * Generates a stub in string form for function types.
     *
     * @method stubGenerators.function
     * @param {Function} target Target function to stub
     * @param {String} name Name of target object for use in reporting errors
     * @param {String} packageName Name of target package for use in errors
     * @return {String} Javascript code in string form which, when executed,
     *                  builds the stub in the then-current global context
     */
    'function': function (target, name, packageName) {
      var stubInStringForm,
          defaultReturnStr = functionReplacementStr,
          objStubber = stubGenerators['object']

      // Attempt to instantiate new constructor with no parameters.
      //   ex. moment().format('MMM dd, YYYY')
      // Some packages have global function objects which throw an error
      // if no parameters are passed (ex. IronRouter's RouteController).
      // In this case, not much we can do.  Just alert the user and stub
      // with an empty function.

      try {
        target = target()
        stubInStringForm = objStubber(target, name, packageName)
        stubInStringForm = "function () { return " + stubInStringForm + "; }"
        return stubInStringForm
      } catch (ex) {
        console.log("[PackageStubber] Calling exported function '" +
            name + "' in package '" + packageName + "' with no parameters" +
            " produced an error. " +
            "'" + name + "' has been stubbed with an empty function " +
            "but if you receive errors due to missing fields in " +
            "this package, you will need to supply your own " +
            "custom stub. The original error was: ", ex.message)
        return defaultReturnStr
      }
    },

    /**
     * Generates a stub in string form for object types.
     *
     * @method stubGenerators.object
     * @param {Object} target Target object to stub
     * @param {String} name Name of target object for use in reporting errors
     * @param {String} packageName Name of target package for use in errors
     * @return {String} String representation of the target object.
     */
    'object': function (target, name, packageName) {
      var intermediateStub,
          stubInStringForm,
          defaultReturnStr = "{}"

      try {
        intermediateStub = deepCopyReplaceFn(target)
        stubInStringForm = _replaceFnPlaceholders(
            JSON.stringify(intermediateStub, null, 2))
        return stubInStringForm
      } catch (ex) {
        console.log("[PackageStubber] Error generating stub for exported " +
            "object '" + name + " in package '" + packageName + "'. " +
            name + "' has been " +
            "stubbed with an empty object but if you receive " +
            "errors due to missing fields in this package, you " +
            "will need to supply your own custom stub. The " +
            "original error follows:\n", ex.message)
        return defaultReturnStr
      }
    },

    /**
     * Generates a stub in string form for string types.
     *
     * @method stubGenerators.string
     * @param {Object} target Target string to stub
     * @param {String} name Name of target string for use in reporting errors
     * @return {String} The original target string, passed through
     */
    'string': function (target, name) {
      return target
    },

    /**
     * Generates a stub in string form for number types.
     *
     * @method stubGenerators.number
     * @param {Object} target Target number to stub
     * @param {String} name Name of target number for use in reporting errors
     * @return {String} The original target number, converted to a string
     */
    'number': function (target, name) {
      return target.toString()
    },

    /**
     * Generates a stub in string form for undefined targets.
     *
     * @method stubGenerators.undefined
     * @return {String} "undefined"
     */
    'undefined': function () {
      return 'undefined'
    }

  }; // end stubGenerators
}(exports));

