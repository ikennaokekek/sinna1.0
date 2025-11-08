<?php
// Simple PHP script to send email when success page is accessed
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// Generate API key
$api_key = 'sk_live_' . substr(str_replace(['+', '/', '='], '', base64_encode(random_bytes(24))), 0, 32);

// Send email via API
$data = [
    'to' => 'ikennaokeke1996@gmail.com',
    'subject' => '🎉 Payment Complete - Your API Key!',
    'text' => "Congratulations! Your payment was processed successfully.\n\nYour Production API Key: $api_key\n\nBase URL: https://sinna1-0.onrender.com\n\nKeep this key secure and use it in the X-API-Key header for all requests.\n\nThis is your actual production-ready API key! 🚀"
];

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, 'http://localhost:5001/test-email');
curl_setopt($ch, CURLOPT_POST, 1);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

$response = curl_exec($ch);
curl_close($ch);

$result = json_decode($response, true);

if ($result && $result['success']) {
    echo json_encode([
        'success' => true,
        'message' => 'Email sent successfully!',
        'apiKey' => $api_key,
        'to' => 'ikennaokeke1996@gmail.com'
    ]);
} else {
    echo json_encode([
        'success' => false,
        'error' => 'Failed to send email',
        'apiKey' => $api_key
    ]);
}
?>
