// Deterministic ONNX protobuf serialization. No runtime or proof-file dependency.
const concat = (...xs) => Buffer.concat(xs.flat());
function varint(value) {
  let n = BigInt(value);
  const bytes = [];
  do { bytes.push(Number(n & 127n) | (n > 127n ? 128 : 0)); n >>= 7n; } while (n);
  return Buffer.from(bytes);
}
const tag = (field, wire) => varint(field * 8 + wire);
const integer = (field, value) => concat(tag(field, 0), varint(value));
const bytes = (field, value) => concat(tag(field, 2), varint(value.length), value);
const string = (field, value) => bytes(field, Buffer.from(value, 'utf8'));
const message = bytes;
function tensor(name, shape, values, type = 1) {
  const raw = Buffer.alloc(values.length * 4);
  values.forEach((value, i) => type === 1 ? raw.writeFloatLE(value, i * 4) : raw.writeInt32LE(value, i * 4));
  return concat(shape.map(x => integer(1, x)), integer(2, type), string(8, name), bytes(9, raw));
}
function valueInfo(name, shape, type = 1) {
  const dims = concat(shape.map(x => message(1, typeof x === 'string' ? string(2, x) : integer(1, x))));
  return concat(string(1, name), message(2, message(1, concat(integer(1, type), message(2, dims)))));
}
function intAttribute(name, value) {
  return concat(string(1, name), integer(3, value), integer(20, 2));
}
function node(op, inputs, outputs, attributes = []) {
  return concat(inputs.map(x => string(1, x)), outputs.map(x => string(2, x)),
    string(3, `${op}_${outputs[0]}`), string(4, op), attributes.map(x => message(5, x)));
}
export { concat, integer, string, message, node, tensor, valueInfo, intAttribute };
