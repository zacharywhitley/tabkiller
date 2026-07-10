const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = !isProduction;

// Determine target browser from command line or default to chrome
const targetBrowser = process.env.TARGET_BROWSER || 'chrome';

const config = {
  mode: isDevelopment ? 'development' : 'production',
  devtool: isDevelopment ? 'inline-source-map' : 'source-map',
  
  entry: {
    'background/service-worker': './src/background/service-worker.ts',
    'content/content-script': './src/content/content-script.ts',
    'popup/popup': './src/ui/popup/index.tsx',
    'options/options': './src/ui/options/index.tsx',
    'options/debug': './src/options/debug/standalone.tsx',
    'history/history': './src/ui/history/index.tsx'
  },
  
  output: {
    path: path.resolve(__dirname, 'build', targetBrowser),
    filename: '[name].js',
    clean: true
  },
  
  resolve: {
    extensions: ['.tsx', '.ts', '.jsx', '.js'],
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true
          }
        },
        exclude: /node_modules/
      },
      {
        test: /\.css$/,
        oneOf: [
          // CSS Modules for component-specific styles (*.module.css)
          {
            test: /\.module\.css$/,
            use: [
              'style-loader',
              {
                loader: 'css-loader',
                options: {
                  modules: {
                    localIdentName: isDevelopment 
                      ? '[name]__[local]__[hash:base64:5]'
                      : '[hash:base64:8]',
                  },
                  importLoaders: 1,
                }
              }
            ]
          },
          // Global CSS for design system and existing styles
          {
            use: ['style-loader', 'css-loader']
          }
        ]
      },
      {
        test: /\.(png|jpg|jpeg|gif|svg)$/,
        type: 'asset/resource',
        generator: {
          filename: 'assets/[name][ext]'
        }
      }
    ]
  },
  
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        {
          from: `src/manifest/${targetBrowser}.json`,
          to: 'manifest.json'
        },
        {
          from: 'src/icons',
          to: 'icons',
          noErrorOnMissing: true
        },
        {
          from: 'src/assets',
          to: 'assets',
          noErrorOnMissing: true
        }
      ]
    }),
    
    new HtmlWebpackPlugin({
      template: 'src/popup/popup.html',
      filename: 'popup/popup.html',
      chunks: ['popup/popup']
    }),
    
    new HtmlWebpackPlugin({
      template: 'src/options/options.html',
      filename: 'options/options.html',
      chunks: ['options/options']
    }),

    new HtmlWebpackPlugin({
      template: 'src/options/debug/standalone.html',
      filename: 'options/debug.html',
      chunks: ['options/debug']
    }),
    
    new HtmlWebpackPlugin({
      template: 'src/ui/history/history.html',
      filename: 'history/history.html',
      chunks: ['history/history']
    }),
    
    // Additional development plugins can be added here
    ...(isDevelopment ? [] : [])
  ],
  
  optimization: {
    minimize: isProduction,
    // Service workers in MV3 cannot dynamically importScripts() extra chunk
    // files at runtime the way pages can via <script> injection. Applying
    // splitChunks to the service worker entry produces a bundle that
    // references sibling files (vendors.js, shared.js, N.js) that Chrome
    // silently fails to load, so the SW never starts and its console stays
    // empty. Exclude the SW entry from splitting; page entries keep the
    // benefit.
    splitChunks: {
      chunks(chunk) {
        return chunk.name !== 'background/service-worker';
      },
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors'
        },
        shared: {
          name: 'shared',
          minChunks: 2
        }
      }
    }
  }
};

// Development server configuration for hot reload
if (isDevelopment) {
  config.devServer = {
    static: {
      directory: path.join(__dirname, 'build', targetBrowser)
    },
    compress: true,
    port: 9000,
    hot: true,
    liveReload: true
  };
}

module.exports = config;