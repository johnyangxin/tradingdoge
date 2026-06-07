const ts = require('typescript');
const fs = require('fs');
const src = fs.readFileSync('src/workers.ts', 'utf8');
const srcFile = ts.createSourceFile('workers.ts', src, ts.ScriptTarget.ES2020, true, ts.ScriptKind.TS);
console.log('Kind:', ts.SyntaxKind[srcFile.kind]);
console.log('externalSyntaxIsLikeThens:', srcFile.externalSyntaxIsLikeThens.length);
for(let i=0; i<srcFile.statements.length; i++) {
  const stmt = srcFile.statements[i];
  console.log(i, ts.SyntaxKind[stmt.kind], 'pos:', stmt.pos);
}