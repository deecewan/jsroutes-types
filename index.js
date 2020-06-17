/* @flow */
const fs = require('fs');
const babel = require('@babel/parser');
const t = require('@babel/types');
const { default: traverse } = require('@babel/traverse');
const { default: generate } = require('@babel/generator');

module.exports = function generateTypes(
  input /*: string */,
  output /*: ?string */,
) {
  const content = fs.readFileSync(input, 'utf8');

  let result = [];
  const traverser = {
    MemberExpression(path) {
      // https://github.com/railsware/js-routes/blob/master/CHANGELOG.md#v140
      var isRouteSetterInObjectPreOneFour = path.node.property.name === 'Routes' && path.parent.type === 'AssignmentExpression'
      var isRouteSetterInObjectPostOneFour = path.node.type === 'MemberExpression' && path.node.object.type === 'AssignmentExpression' && path.node.object.right.properties

      if (isRouteSetterInObjectPreOneFour || isRouteSetterInObjectPostOneFour) {
        var properties

        if (isRouteSetterInObjectPreOneFour) {
          properties = path.parent.right.properties

          result = properties.map((property) => ({
            name: property.key.name,
            requiredArgs: property.value.arguments[0].elements.map(
              (a) => a.value,
            ),
            optionalArgs: property.value.arguments[1].elements.map(
              (a) => a.value,
            ),
          }));
        } else if (isRouteSetterInObjectPostOneFour) {
          properties = path.node.object.right.properties

          result = properties.map((property) => ({
            name: property.key.name,
            requiredArgs: property.value.arguments[0].elements.filter(a => a.elements[1].argument.value === 0).map(a => a.elements[0].value),
            optionalArgs: property.value.arguments[0].elements.filter(a => a.elements[1].argument.value === 1).map(a => a.elements[0].value),
          }));
        }
      }
    },
  };

  const ast = babel.parse(content);

  traverse(ast, traverser);

  const stringableId = t.identifier('Stringable');
  const stringableType = t.interfaceDeclaration(
    stringableId,
    null,
    [],
    t.objectTypeAnnotation([
      t.objectTypeProperty(
        t.identifier('toString'),
        t.functionTypeAnnotation(null, [], null, t.stringTypeAnnotation()),
      ),
    ]),
  );
  const stringableValue = t.genericTypeAnnotation(stringableId);

  const validValueId = t.identifier('ValidValue');
  const validValueType = t.declareTypeAlias(
    validValueId,
    null,
    t.unionTypeAnnotation([
      t.stringTypeAnnotation(),
      t.numberTypeAnnotation(),
      t.booleanTypeAnnotation(),
      stringableValue,
    ]),
  );
  const validValue = t.genericTypeAnnotation(validValueId);

  function generateOptionalParam(optionalArgs) {
    const properties = optionalArgs.map((arg) => ({
      // this is being spread on because `optional` exists and should work
      // but the type builder doesn't understand it. so we build what we can,
      // and then manually add `optional: true`
      ...t.objectTypeProperty(t.identifier(arg), t.mixedTypeAnnotation()),
      optional: true,
    }));
    const indexer = t.objectTypeIndexer(
      t.identifier('query'),
      t.stringTypeAnnotation(),
      t.mixedTypeAnnotation(),
    );
    return t.functionTypeParam(
      t.identifier('options'),
      t.nullableTypeAnnotation(t.objectTypeAnnotation(properties, [indexer])),
    );
  }

  // create type declarations
  const types = result
    .map((details) => {
      const hasRequired = details.requiredArgs.length > 0;
      const required = details.requiredArgs.map((arg) =>
        t.functionTypeParam(t.identifier(arg), validValue),
      );

      const requiredObject = t.functionTypeParam(
        t.identifier('required'),
        t.objectTypeAnnotation(
          details.requiredArgs.map((arg) =>
            t.objectTypeProperty(t.identifier(arg), validValue),
          ),
          null,
          null,
          null,
          true, // this is an exact object
        ),
      );

      const optional = generateOptionalParam(details.optionalArgs);
      const createType = (req) =>
        t.declareExportDeclaration(
          t.declareFunction({
            ...t.identifier(details.name),
            typeAnnotation: t.typeAnnotation(
              t.functionTypeAnnotation(
                null,
                req.concat(optional),
                null,
                t.stringTypeAnnotation(),
              ),
            ),
          }),
        );
      if (!hasRequired) {
        // we still need to wrap in an object because we're calling flatten
        return [createType([])];
      }
      return [required, [requiredObject]].map((req) => createType(req));
    })
    .reduce((acc, curr) => [...acc, ...curr], []);

  const prog = t.file(t.program([stringableType, validValueType, ...types]));

  const generated = generate(prog, {});

  const code = `/**
  * WARNING: Generated File
  * This file is generated by \`jsroutes-types\`
  * We are adding types to the generated Routes helpers created by js-routes
  *
  * @flow
*/

${generated.code}`;

  if (output) {
    fs.writeFileSync(output, code, { encoding: 'utf8' });
  } else {
    // eslint-disable-next-line no-console
    console.log(code);
  }
};
