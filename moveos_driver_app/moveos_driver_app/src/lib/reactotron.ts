import Reactotron from 'reactotron-react-native';
import { Platform } from 'react-native';

const reactotron = Reactotron.configure({
  name: 'Moveos User App',
  // Android emulator reaches the host machine at 10.0.2.2; iOS simulator uses localhost
  host: Platform.OS === 'android' ? '10.0.2.2' : 'localhost',
})
  .useReactNative({
    networking: {
      // ignore Metro symbolicate requests — they're noise
      ignoreUrls: /\/(symbolicate|hot)/,
    },
  })
  .connect();

export default reactotron;
