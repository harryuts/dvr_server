const https = require('https');
const fs = require('fs');
const path = require('path');

// Configuration
const API_KEY = '598a5c8dbc240d76336732556e95e2fcfdce1e2a368ce66c88a3c6c9e41da048';
const BASE_URL = 'mammampos.mammam.com.au';
const PORT = 3006;

// Test parameters - using minutes from now instead of timestamp
const TEST_PARAMS = {
    minutesFromNow: 1, // Get picture from 1 minute ago
    channelNumber: "ch2" // Using channel name format like ch1, ch2
};

function testJpegIotAPI() {
    console.log('Testing /getJpegIot API endpoint...');
    console.log('Parameters:', TEST_PARAMS);
    
    // Build query string
    const queryParams = new URLSearchParams({
        minutesFromNow: TEST_PARAMS.minutesFromNow,
        channelNumber: TEST_PARAMS.channelNumber
    });
    
    const options = {
        hostname: BASE_URL,
        port: PORT,
        path: `/pos/getJpegIot?${queryParams.toString()}`,
        method: 'GET',
        headers: {
            'X-API-Key': API_KEY,
            'User-Agent': 'DVR-Test-Script/1.0'
        },
        rejectUnauthorized: false // For self-signed certificates
    };
    
    console.log(`Making request to: https://${BASE_URL}:${PORT}${options.path}`);
    
    const req = https.request(options, (res) => {
        console.log(`Status Code: ${res.statusCode}`);
        console.log(`Headers:`, res.headers);
        
        if (res.statusCode === 200) {
            // Check if response is actually a JPEG
            const contentType = res.headers['content-type'];
            if (contentType && contentType.includes('image/jpeg')) {
                console.log('✅ Success! Received JPEG image');
                
                // Save the image to a file for verification
                const outputPath = path.join(__dirname, `test_output_${Date.now()}.jpg`);
                const fileStream = fs.createWriteStream(outputPath);
                
                res.pipe(fileStream);
                
                fileStream.on('finish', () => {
                    console.log(`✅ Image saved to: ${outputPath}`);
                    
                    // Get file stats
                    const stats = fs.statSync(outputPath);
                    console.log(`Image size: ${stats.size} bytes`);
                    
                    // Test complete
                    console.log('\n🎉 Test completed successfully!');
                    console.log(`The API returned a ${res.headers['content-length']} byte JPEG image`);
                    console.log(`Image dimensions should be 800x480 pixels`);
                });
                
                fileStream.on('error', (err) => {
                    console.error('❌ Error saving file:', err);
                });
                
            } else {
                console.log('❌ Unexpected content type:', contentType);
                console.log('Expected: image/jpeg');
                
                // Log response body for debugging
                let responseData = '';
                res.on('data', (chunk) => {
                    responseData += chunk;
                });
                
                res.on('end', () => {
                    console.log('Response body:', responseData);
                });
            }
        } else {
            console.log('❌ Request failed with status:', res.statusCode);
            
            // Log error response
            let errorData = '';
            res.on('data', (chunk) => {
                errorData += chunk;
            });
            
            res.on('end', () => {
                console.log('Error response:', errorData);
            });
        }
    });
    
    req.on('error', (err) => {
        console.error('❌ Request error:', err.message);
        
        if (err.code === 'ENOTFOUND') {
            console.log('💡 Tip: Make sure the hostname is correct and accessible');
        } else if (err.code === 'ECONNREFUSED') {
            console.log('💡 Tip: Make sure the server is running on port', PORT);
        } else if (err.code === 'CERT_HAS_EXPIRED' || err.code === 'SELF_SIGNED_CERT_IN_CHAIN') {
            console.log('💡 Tip: Certificate issue - this is normal for development servers');
        }
    });
    
    req.setTimeout(30000, () => {
        console.log('❌ Request timeout after 30 seconds');
        req.destroy();
    });
    
    req.end();
}


// Run the main test
console.log('🚀 Starting DVR Server /getJpegIot API Test');
console.log('='.repeat(50));
testJpegIotAPI();

// Uncomment the lines below to run additional tests with different parameters
// setTimeout(() => {
//     testWithCustomParams(10, "ch2"); // 10 minutes ago, channel ch2
// }, 2000);
