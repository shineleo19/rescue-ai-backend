-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(15) UNIQUE NOT NULL,
    name VARCHAR(100),
    email VARCHAR(100),
    user_type VARCHAR(20) DEFAULT 'citizen', -- 'citizen', 'dispatcher', 'admin'
    is_available BOOLEAN DEFAULT FALSE,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    volunteer_status VARCHAR(20) DEFAULT 'none', -- 'none', 'pending', 'approved', 'rejected'
    blood_type VARCHAR(5),
    allergies TEXT,
    medical_conditions TEXT,
    emergency_contact_1 VARCHAR(100),
    emergency_contact_1_phone VARCHAR(15),
    emergency_contact_2 VARCHAR(100),
    emergency_contact_2_phone VARCHAR(15),
    fcm_token TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Incidents Table
CREATE TABLE IF NOT EXISTS incidents (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    incident_type VARCHAR(50), 
    severity VARCHAR(20), 
    status VARCHAR(20) DEFAULT 'pending', 
    description TEXT,
    accepted_by INTEGER REFERENCES users(id),
    accepted_at TIMESTAMP,
    photo_url TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    resolved_at TIMESTAMP,
    response_time_minutes INTEGER
);

-- Resources Table (Ambulances, Police, Fire)
CREATE TABLE IF NOT EXISTS resources (
    id SERIAL PRIMARY KEY,
    resource_type VARCHAR(20), 
    vehicle_number VARCHAR(20) UNIQUE NOT NULL,
    driver_name VARCHAR(100),
    driver_phone VARCHAR(15),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    status VARCHAR(20) DEFAULT 'available', 
    last_updated TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Dispatches Table
CREATE TABLE IF NOT EXISTS dispatches (
    id SERIAL PRIMARY KEY,
    incident_id INTEGER REFERENCES incidents(id),
    resource_id INTEGER REFERENCES resources(id),
    dispatched_at TIMESTAMP DEFAULT NOW(),
    en_route_at TIMESTAMP,
    arrived_at TIMESTAMP,
    completed_at TIMESTAMP,
    notes TEXT
);

-- Location History Table (For tracking ambulance routes)
CREATE TABLE IF NOT EXISTS location_history (
    id SERIAL PRIMARY KEY,
    resource_id INTEGER REFERENCES resources(id),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    timestamp TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_resources_status ON resources(status);

-- Volunteer Applications Table
CREATE TABLE IF NOT EXISTS volunteer_applications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE REFERENCES users(id),
    full_name VARCHAR(100),
    skills TEXT,
    vehicle_type VARCHAR(50),
    notes TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    reviewed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);