const version = require('./package.json').version;

export default {
  input: 'build/src/ng1.js',
  output: {
    file: 'dist/satellizer.js',
    format: 'umd',
    name: 'satellizer',
    sourcemap: true,
    banner: '/**\n * Satellizer ' + version + '\n * (c) 2016 Sahat Yalkabov \n * License: MIT \n */\n'
  }
}
