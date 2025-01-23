import { StyleSheet, TextInput, Button, View, ScrollView, Keyboard, TouchableWithoutFeedback, Alert } from 'react-native';
import { useState } from 'react';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import axios from 'axios';

const api_url = 'http://localhost:5001';

export default function TabTwoScreen() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [prompt, setPrompt] = useState('');

  const handleSubmit = async () => {
    if (!phoneNumber || phoneNumber.length !== 10) {
      Alert.alert('Error', 'Please enter a valid phone number.');
      return;
    }
  
    try {
      // Make the POST request to your backend
      const response = await fetch(api_url+'/call', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phoneNumber: `+1${phoneNumber}`, // Assuming US phone numbers
          promptText: prompt,
        }),
      });
  
      const result = await response.json();
  
      if (response.ok) {
        Alert.alert('Success', `Call initiated! Call SID: ${result.callSid}`);
      } else {
        Alert.alert('Error', result.error || 'Failed to initiate the call.');
      }
    } catch (error) {
      console.error('Error:', error);
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <ThemedView style={styles.container}>
          <ThemedText type="title" style={styles.title}>Submit Details</ThemedText>

          <ThemedText style={styles.label}>Phone Number</ThemedText>
          <TextInput
            style={styles.inputSmall}
            placeholder="Enter your phone number"
            keyboardType="phone-pad"
            placeholderTextColor="#AAAAAA"
            value={phoneNumber}
            onChangeText={setPhoneNumber}
          />

          <ThemedText style={styles.label}>Prompt</ThemedText>
          <TextInput
            style={styles.inputLarge}
            placeholder="Enter your prompt"
            multiline
            placeholderTextColor="#AAAAAA"
            value={prompt}
            onChangeText={setPrompt}
          />

          <Button title="Submit" onPress={handleSubmit} />
        </ThemedView>
      </ScrollView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 1,
  },
  container: {
    flex: 1,
    padding: 20,
    marginTop: 40,
    backgroundColor: '#333333',
  },
  title: {
    marginBottom: 20,
    textAlign: 'center',
    color: '#FFFFFF',
  },
  label: {
    marginBottom: 8,
    fontSize: 16,
    color: '#FFFFFF',
  },
  inputSmall: {
    height: 40,
    borderColor: '#555555',
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 20,
    paddingHorizontal: 10,
    backgroundColor: '#444444',
    color: '#FFFFFF',
  },
  inputLarge: {
    height: 100,
    borderColor: '#555555',
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 20,
    paddingHorizontal: 10,
    paddingTop: 10,
    backgroundColor: '#444444',
    textAlignVertical: 'top',
    color: '#FFFFFF',
  },
});
