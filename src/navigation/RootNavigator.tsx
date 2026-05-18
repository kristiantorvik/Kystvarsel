import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NavigatorScreenParams } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { SpotsListScreen } from '../screens/SpotsListScreen';
import { SpotFormScreen } from '../screens/SpotFormScreen';
import { SpotForecastScreen } from '../screens/SpotForecastScreen';
import { SpotMapPickerScreen } from '../screens/SpotMapPickerScreen';
import { LayersListScreen } from '../screens/LayersListScreen';
import { LayerFormScreen } from '../screens/LayerFormScreen';
import { MapPaintScreen } from '../screens/MapPaintScreen';
import { TagFormScreen } from '../screens/TagFormScreen';
import { AlertsListScreen } from '../screens/AlertsListScreen';
import { AlertFormScreen } from '../screens/AlertFormScreen';
import { AlertDetailScreen } from '../screens/AlertDetailScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { strings } from '../i18n';

export type SpotsStackParamList = {
  /**
   * `focusSpot` is a "jump to this spot on the map" signal. When set,
   * SpotsListScreen forces its view mode to 'map' on the next focus,
   * then clears the param. Source: the "Vis på kart" button on the
   * forecast view. The actual map centre + zoom is conveyed via
   * `rememberedMapState` (already updated by the caller).
   */
  SpotsList: { focusSpot?: string } | undefined;
  SpotForm: { spotId?: string; pickedLat?: number; pickedLon?: number };
  SpotForecast: { spotId: string };
  SpotMapPicker: { initialLat?: number; initialLon?: number };
  LayersList: undefined;
  LayerForm: { layerId?: string };
  MapPaint: { layerId: string };
  TagForm: { tagId?: string };
};

export type AlertsStackParamList = {
  AlertsList: undefined;
  AlertForm: { alertId?: string; defaultSpotId?: string };
  AlertDetail: { alertId: string };
};

export type SettingsStackParamList = {
  SettingsHome: undefined;
};

export type TabParamList = {
  SpotsTab: NavigatorScreenParams<SpotsStackParamList>;
  AlertsTab: NavigatorScreenParams<AlertsStackParamList>;
  SettingsTab: NavigatorScreenParams<SettingsStackParamList>;
};

const Tab = createBottomTabNavigator<TabParamList>();
const SpotsStack = createNativeStackNavigator<SpotsStackParamList>();
const AlertsStack = createNativeStackNavigator<AlertsStackParamList>();
const SettingsStack = createNativeStackNavigator<SettingsStackParamList>();

function SpotsStackNav() {
  const s = strings();
  return (
    <SpotsStack.Navigator>
      <SpotsStack.Screen name="SpotsList" component={SpotsListScreen} options={{ title: s.spots.title }} />
      <SpotsStack.Screen name="SpotForm" component={SpotFormScreen} options={{ title: s.spots.add }} />
      <SpotsStack.Screen name="SpotForecast" component={SpotForecastScreen} options={{ title: s.forecast.title }} />
      <SpotsStack.Screen name="SpotMapPicker" component={SpotMapPickerScreen} options={{ title: s.spots.mapPickerTitle }} />
      <SpotsStack.Screen name="LayersList" component={LayersListScreen} options={{ title: s.layers.title }} />
      <SpotsStack.Screen name="LayerForm" component={LayerFormScreen} options={{ title: s.layers.add }} />
      <SpotsStack.Screen name="MapPaint" component={MapPaintScreen} options={{ title: s.layers.paintTitle }} />
      <SpotsStack.Screen name="TagForm" component={TagFormScreen} options={{ title: s.tags.add }} />
    </SpotsStack.Navigator>
  );
}

function AlertsStackNav() {
  const s = strings();
  return (
    <AlertsStack.Navigator>
      <AlertsStack.Screen name="AlertsList" component={AlertsListScreen} options={{ title: s.alerts.title }} />
      <AlertsStack.Screen name="AlertForm" component={AlertFormScreen} options={{ title: s.alerts.add }} />
      <AlertsStack.Screen name="AlertDetail" component={AlertDetailScreen} options={{ title: s.alerts.detail.title }} />
    </AlertsStack.Navigator>
  );
}

function SettingsStackNav() {
  const s = strings();
  return (
    <SettingsStack.Navigator>
      <SettingsStack.Screen name="SettingsHome" component={SettingsScreen} options={{ title: s.settings.title }} />
    </SettingsStack.Navigator>
  );
}

export function RootNavigator() {
  const s = strings();
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen
        name="SpotsTab"
        component={SpotsStackNav}
        options={{
          title: s.tabs.spots,
          tabBarIcon: ({ color, size }) => <Ionicons name="location-outline" color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="AlertsTab"
        component={AlertsStackNav}
        options={{
          title: s.tabs.alerts,
          tabBarIcon: ({ color, size }) => <Ionicons name="notifications-outline" color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsStackNav}
        options={{
          title: s.tabs.settings,
          tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" color={color} size={size} />,
        }}
      />
    </Tab.Navigator>
  );
}
