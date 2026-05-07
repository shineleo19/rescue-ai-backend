const db = require('../config/database');

exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.id; // From your JWT token
    
    // Extracting the EXACT columns from your schema
    const { 
      name, 
      email, 
      blood_type, 
      allergies, 
      medical_conditions, 
      emergency_contact_1, 
      emergency_contact_1_phone,
      emergency_contact_2,
      emergency_contact_2_phone
    } = req.body;

    // The COALESCE trick ensures we don't accidentally erase data if the user leaves a field blank
    await db.query(
      `UPDATE users 
       SET 
         name = COALESCE($1, name),
         email = COALESCE($2, email),
         blood_type = COALESCE($3, blood_type),
         allergies = COALESCE($4, allergies),
         medical_conditions = COALESCE($5, medical_conditions),
         emergency_contact_1 = COALESCE($6, emergency_contact_1),
         emergency_contact_1_phone = COALESCE($7, emergency_contact_1_phone),
         emergency_contact_2 = COALESCE($8, emergency_contact_2),
         emergency_contact_2_phone = COALESCE($9, emergency_contact_2_phone),
         updated_at = NOW() 
       WHERE id = $10`,
      [
        name, email, blood_type, allergies, medical_conditions, 
        emergency_contact_1, emergency_contact_1_phone, 
        emergency_contact_2, emergency_contact_2_phone, 
        userId
      ]
    );

    res.status(200).json({ 
      success: true, 
      message: "Profile updated successfully!" 
    });

  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({ success: false, message: "Server error updating profile" });
  }
};