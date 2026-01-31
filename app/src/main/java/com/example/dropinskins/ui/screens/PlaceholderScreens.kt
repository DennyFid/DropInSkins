package com.example.dropinskins.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController

@Composable
fun PlayerManagementScreen(navController: NavController) {
    Column(modifier = Modifier.padding(16.dp)) {
        Text("Group Setup", style = MaterialTheme.typography.headlineMedium)
        Spacer(modifier = Modifier.height(16.dp))
        Button(onClick = { navController.navigate("round_setup") }) {
            Text("Next: Round Setup")
        }
    }
}

@Composable
fun RoundSetupScreen(navController: NavController) {
    Column(modifier = Modifier.padding(16.dp)) {
        Text("Round Setup", style = MaterialTheme.typography.headlineMedium)
        Spacer(modifier = Modifier.height(16.dp))
        Button(onClick = { navController.navigate("scoring") }) {
            Text("Start Round")
        }
    }
}

@Composable
fun StatsScreen(navController: NavController) {
    Column(modifier = Modifier.padding(16.dp)) {
        Text("Totals & Stats", style = MaterialTheme.typography.headlineMedium)
        Spacer(modifier = Modifier.height(16.dp))
        Button(onClick = { navController.navigate("history") }) {
            Text("View History")
        }
    }
}

@Composable
fun HistoryScreen(navController: NavController) {
    Column(modifier = Modifier.padding(16.dp)) {
        Text("Game History", style = MaterialTheme.typography.headlineMedium)
        Spacer(modifier = Modifier.height(16.dp))
        Button(onClick = { navController.navigate("group_setup") }) {
            Text("Back to Start")
        }
    }
}
