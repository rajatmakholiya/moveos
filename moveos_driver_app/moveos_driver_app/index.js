/**
 * @format
 * react-native-get-random-values must be the FIRST import — it polyfills
 * crypto.getRandomValues() before uuid or any other library needs it.
 */
import 'react-native-get-random-values';

// Reactotron must be imported before the app component so it can patch
// XMLHttpRequest (and therefore fetch) before any network calls happen.
if (__DEV__) {
  require('./src/lib/reactotron');
}

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
