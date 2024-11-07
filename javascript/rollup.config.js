import ts from '@rollup/plugin-typescript'
import fs from 'fs-extra'

const isCJSBuild = process.env.MODE === 'cjs'

const commonjsPkgJSONPlugin = () => {
  return {
    name: 'commonjsPkgJSONPlugin',
    writeBundle: async () => {
      if (isCJSBuild === true) {
        fs.writeJsonSync(
          'dist/cjs/package.json',
            {
              type: 'commonjs',
            }
        )
      } else {
        await fs.copyFile('package.json', 'dist/package.json')
      }
    },
  }
}

export default {
  input: ['index.ts', 'example.ts'],
  output: [
    {
      dir: isCJSBuild ? 'dist/cjs' : 'dist',
      format: isCJSBuild ? 'cjs' : 'esm',
      entryFileNames: isCJSBuild ? '[name].js' : '[name].mjs', // Output file name pattern
      chunkFileNames: isCJSBuild ? '[name]-[hash].js' : '[name]-[hash].mjs', // For code splitting
    },
  ],
  plugins: [ts({ tsconfig: isCJSBuild ? 'tsconfig.cjs.json' : 'tsconfig.json' }), commonjsPkgJSONPlugin()],
  external: [],
}
