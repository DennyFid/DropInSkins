package com.example.dropinskins.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController

@Composable
fun ScoringScreen(navController: NavController) {
    var holeNumber by remember { mutableIntStateOf(1) }
    // Simulated state for now
    val participants = listOf("Alice", "Bob", "Charlie") 
    val scores = remember { mutableStateMapOf<String, String>() }

    Column(modifier = Modifier.padding(16.dp)) {
        Text("Hole $holeNumber", style = MaterialTheme.typography.headlineMedium)
        Spacer(modifier = Modifier.height(16.dp))

        LazyColumn(modifier = Modifier.weight(1f)) {
            items(participants) { player ->
                Row(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(player, modifier = Modifier.weight(1f))
                    TextField(
                        value = scores[player] ?: "",
                        onValueChange = { scores[player] = it },
                        modifier = Modifier.width(100.dp),
                        label = { Text("Score") }
                    )
                }
            }
        }

        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Button(onClick = { if (holeNumber > 1) holeNumber-- }) {
                Text("Previous")
            }
            Button(onClick = { /* Save result and go to next hole */ }) {
                Text("Next Hole")
            }
        }
        
        Spacer(modifier = Modifier.height(16.dp))
        
        Button(
            onClick = { navController.navigate("stats") },
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("View Totals & Stats")
        }
    }
}
