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
    'popup/popup': './src/popup/popup.ts'
  },
  
  output: {
    path: path.resolve(__dirname, 'build', targetBrowser),
    filename: '[name].js',
    clean: true
  },
  
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  
  module: {
    rules: [
      {
        test: /\.ts$/,
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
        use: ['style-loader', 'css-loader']
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
    
    // Add webpack extension reloader for development
    ...(isDevelopment ? [] : [])
  ],
  
  optimization: {
    minimize: isProduction,
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all'
        },
        shared: {
          name: 'shared',
          chunks: 'all',
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