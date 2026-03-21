import { readFileSync, writeFileSync } from "fs";
const path = "src/proto/compiled.js";
let content = readFileSync(path, "utf8");
content = content.replace(
  'import * as $protobuf from "protobufjs/minimal";',
  'import protobufjs from "protobufjs/minimal.js";\nconst $protobuf = protobufjs;'
);
writeFileSync(path, content);
