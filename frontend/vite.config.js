// frontend/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteCommonjs } from '@originjs/vite-plugin-commonjs';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  plugins: [
    react(),
    viteCommonjs(),
    viteStaticCopy({
      targets: [
        {
          // Copy the worker file we found in dist/esm/
          src: 'node_modules/@cornerstonejs/dicom-image-loader/dist/esm/decodeImageFrameWorker.js',
          dest: '.' // Copy to root of dist/
        },
        {
          // Copy the entire codecs directory
          src: 'node_modules/@cornerstonejs/dicom-image-loader/dist/esm/codecs',
          dest: 'codecs' // Copy to a 'codecs' subdirectory in dist/
        }
      ]
    })
  ],
  optimizeDeps: {
    exclude: ['@cornerstonejs/dicom-image-loader'],
    include: ['dicom-parser'],
  },
  worker: {
    format: 'es',
  },
  // ... server proxy etc ...
});