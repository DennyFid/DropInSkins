import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { initDatabase } from "./src/data/database";
import { GroupSetupScreen } from "./src/ui/screens/GroupSetupScreen";
import { RoundSetupScreen } from "./src/ui/screens/RoundSetupScreen";
import { ScoringScreen } from "./src/ui/screens/ScoringScreen";
import { StatsScreen } from "./src/ui/screens/StatsScreen";
import { HistoryScreen } from "./src/ui/screens/HistoryScreen";
import { View, Text, ActivityIndicator } from "react-native";

const Stack = createNativeStackNavigator();

export default function App() {
  const [dbInitialized, setDbInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initDatabase()
      .then(() => setDbInitialized(true))
      .catch((err) => {
        console.error("Failed to init DB:", err);
        setError(err.message || "Unknown error during initialization");
      });
  }, []);

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 20 }}>
        <Text style={{ fontSize: 18, color: "red", fontWeight: "bold" }}>Initialization Error</Text>
        <Text style={{ marginTop: 10, textAlign: "center" }}>{error}</Text>
      </View>
    );
  }

  if (!dbInitialized) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
        <Text>Initializing Database...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="GroupSetup"
        screenOptions={{
          headerTitleAlign: 'center',
          headerTitleStyle: {
            fontSize: 22,
            fontWeight: 'bold',
          },
        }}
      >
        <Stack.Screen name="GroupSetup" component={GroupSetupScreen} options={{ title: "Player Management" }} />
        <Stack.Screen name="RoundSetup" component={RoundSetupScreen} options={{ title: "Drop-in-Skins" }} />
        <Stack.Screen name="Scoring" component={ScoringScreen} options={{ title: "Live Scoring" }} />
        <Stack.Screen name="Stats" component={StatsScreen} options={{ title: "Round Report" }} />
        <Stack.Screen name="History" component={HistoryScreen} options={{ title: "Past Rounds" }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
