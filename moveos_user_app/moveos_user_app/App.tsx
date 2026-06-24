import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar as RNStatusBar } from 'react-native';

import { Providers } from './src/app/bootstrap/Providers';
import { ErrorBoundary } from './src/app/bootstrap/ErrorBoundary';
import { useAppInitializer } from './src/app/bootstrap/AppInitializer';
import RootNavigator from './src/navigation/RootNavigator';
import { linkingConfig } from './src/navigation/linking.config';

function AppCore() {
  useAppInitializer();
  return <RootNavigator />;
}

function App() {
  return (
    <ErrorBoundary>
      <Providers>
        <NavigationContainer linking={linkingConfig}>
          <RNStatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
          <AppCore />
        </NavigationContainer>
      </Providers>
    </ErrorBoundary>
  );
}

export default App;
