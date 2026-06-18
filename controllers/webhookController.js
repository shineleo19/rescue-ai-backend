const db = require('../config/database');
const twilio = require('twilio');
const axios = require('axios'); // 👈 We need axios to call Google Maps!
const { sendSilentWakeUpPing } = require('./incidentController');

// 1. THE HAVERSINE MATH (Keep this to calculate the exact distance to the Google Place)
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; 
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

exports.handleSmsSos = async (req, res) => {
  try {
    const { messageText, senderNumber } = req.body;
    console.log(`\n🚨 Incoming Offline SMS SOS from ${senderNumber}`);

    if (!messageText || !messageText.startsWith('SOS|')) {
      return res.status(400).send("Invalid format");
    }

    // 2. PARSE PAYLOAD (e.g., SOS|U:Shine|T:MED|V:Y|EV:Y|C:Y|LL:8.18,77.41)
    const parts = messageText.split('|');
    let data = {};
    parts.forEach(part => {
      const [key, val] = part.split(':');
      if (key && val) data[key] = val;
    });

    if (!data.LL) throw new Error("Missing GPS coordinates");
    const [lat, lon] = data.LL.split(',').map(Number);
    const typeMap = { 'MED': 'Medical', 'FIR': 'Fire', 'ACC': 'Accident', 'POL': 'Police' };
    const incidentType = typeMap[data.T] || 'Emergency';

    const wantsVolunteer = data.V !== 'N'; 
    const wantsVehicle = data.EV !== 'N';
    const notifyContacts = data.C !== 'N';

    // ====================================================================
    // 3. 🚨 THE GOOGLE MAPS API ENGINE (Top 6 Strict Phone Filter)
    // ====================================================================
    let facilitiesListString = "No facilities found nearby.";

    const googleTypeMap = { 
      'MED': ['hospital'], 
      'FIR': ['fire_station'], 
      'ACC': ['hospital'], 
      'POL': ['police'] 
    };
    const searchTypes = googleTypeMap[data.T] || ['hospital'];

    try {
      console.log(`🗺️ Pinging Google Maps for places with valid phone numbers...`);
      
      const googleUrl = `https://places.googleapis.com/v1/places:searchNearby`;
      
      const requestBody = {
        includedTypes: searchTypes,
        maxResultCount: 20, 
        locationRestriction: {
          circle: {
            center: { latitude: parseFloat(lat), longitude: parseFloat(lon) },
            radius: 15000.0 
          }
        }
      };

      const googleResponse = await axios.post(googleUrl, requestBody, {
        headers: {
          'Content-Type': 'application/json',
          // 🚨 Remember to use your NEW API Key here!
          'X-Goog-Api-Key': 'AIzaSyDu7ngCuzdFbqYSUsggkFUhA_5tTBxU4Zo', 
          'X-Goog-FieldMask': 'places.displayName,places.location,places.nationalPhoneNumber,places.internationalPhoneNumber,places.formattedAddress' 
        }
      });
      
      if (googleResponse.data.places && googleResponse.data.places.length > 0) {
        
        // Filter out places that don't have a phone number
        let placesWithPhones = googleResponse.data.places.filter(
          place => place.nationalPhoneNumber || place.internationalPhoneNumber
        );

        // Fallback: If zero places have phones, just use the raw list
        if (placesWithPhones.length === 0) {
           placesWithPhones = googleResponse.data.places; 
        }

        // 🚨 Grab the top 6 closest facilities!
        let top6Places = placesWithPhones.slice(0, 6);
        let facilityDetails = [];
        
        top6Places.forEach((place, index) => {
          let name = place.displayName.text.substring(0, 15); // Made slightly shorter to save SMS space
          let phoneRaw = place.nationalPhoneNumber || place.internationalPhoneNumber;
          
          let contactInfo = "📞N/A";
          if (phoneRaw) {
             contactInfo = "📞" + phoneRaw.replace(/[\s-]/g, '');
          } else if (place.formattedAddress) {
             let shortAddress = place.formattedAddress.split(',')[0].substring(0, 15);
             contactInfo = "📍" + shortAddress;
          }
          
          let destLat = place.location.latitude;
          let destLng = place.location.longitude;
          let dist = getDistance(lat, lon, destLat, destLng).toFixed(1); // Dropped back to .1 to save SMS characters
          
          facilityDetails.push(`${index + 1}. ${name}(${dist}km) ${contactInfo}`);
        });
        
        facilitiesListString = facilityDetails.join('\n');
        console.log(`✅ Filtered down to ${top6Places.length} facilities with valid phones.`);
      } else {
        console.log(`⚠️ Google Maps returned no results.`);
      }
    } catch (googleErr) {
      console.error("❌ Google Maps API Error:", googleErr.response ? googleErr.response.data : googleErr.message);
    }

    // 4. DATABASE: UPSERT USER & GRAB EMERGENCY CONTACTS
    const userResult = await db.query(
      `INSERT INTO users (phone, name) 
       VALUES ($1, $2) 
       ON CONFLICT (phone) 
       DO UPDATE SET updated_at = NOW() 
       RETURNING id, name, emergency_contact_1_phone, emergency_contact_2_phone`,
      [senderNumber, data.U || 'Offline User']
    );
    const user = userResult.rows[0];

    // 5. DATABASE: INJECT INCIDENT
    const incidentResult = await db.query(
      `INSERT INTO incidents (user_id, latitude, longitude, incident_type, severity, description, status, needs_volunteer, needs_vehicle, notified_contacts) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        user.id, lat, lon, incidentType, 'high', 
        '[OFFLINE SMS] Alert triggered without internet. Routed via hardware gateway.',
        (wantsVolunteer || wantsVehicle) ? 'pending' : 'self-routed',
        wantsVolunteer, wantsVehicle, notifyContacts
      ]
    );
    const incident = incidentResult.rows[0];

    // 6. ALERT LIVE MAP & VOLUNTEERS
    const io = req.app.get('io');
    if (io) io.emit('new_incident', { incident }); 

    if (wantsVolunteer && typeof sendSilentWakeUpPing === 'function') {
      sendSilentWakeUpPing(incident.id, lat, lon, incidentType).catch(err => console.log(err));
    }

    // 7. THE WHATSAPP BROADCAST ENGINE (Twilio API)
    if (notifyContacts) {
      const familyPhones = [];
      if (user.emergency_contact_1_phone) familyPhones.push(user.emergency_contact_1_phone.trim());
      if (user.emergency_contact_2_phone) familyPhones.push(user.emergency_contact_2_phone.trim());

      if (familyPhones.length > 0 && process.env.TWILIO_ACCOUNT_SID) {
        const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        const twilioNumber = process.env.TWILIO_WHATSAPP_NUMBER;
        const mapsLink = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
        
        const whatsappMessage = `*🚨 URGENT RESCUEAI ALERT 🚨*\n\n${user.name || 'Your family member'} has triggered a *${incidentType} SOS* via our offline network.\n\n📍 *Live Location:* ${mapsLink}\n\nPlease attempt to contact them or reach the location immediately.`;

        await Promise.all(familyPhones.map(async (phone) => {
          try {
            const formattedNumber = phone.startsWith('+') ? phone : `+91${phone}`;
            await twilioClient.messages.create({
              body: whatsappMessage,
              from: `whatsapp:${twilioNumber}`,
              to: `whatsapp:${formattedNumber}`
            });
          } catch (twilioErr) {
            console.error(`❌ Twilio failed for ${formattedNumber}:`, twilioErr.message);
          }
        }));
      }
    }

    // ====================================================================
    // 8. TAILOR THE NATIVE MACRODROID TEXT REPLY BACK TO THE VICTIM
    // ====================================================================
    // 🚨 Notice how we dynamically inject the real Google Maps data here!
    let replyText = `RescueAI SOS Logged!\n\nNearby:\n${facilitiesListString}\n\nUpdates:`;
    
    if (wantsVehicle) replyText += ` Amb req.`;
    if (notifyContacts) replyText += ` Fam alerted.`;
    if (wantsVolunteer) replyText += ` Vols coming.`;
    
    console.log(`📡 Sending plain text reply to victim:\n"${replyText}"`);
    return res.status(200).send(replyText);

  } catch (error) {
    console.error("💥 Webhook Pipeline Error:", error.message);
    return res.status(500).send("RescueAI Error: System offline. Call 108.");
  }
};