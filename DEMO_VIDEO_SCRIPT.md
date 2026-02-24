# FirstLine 2.0 Demo Script (3 minutes)

## Scene 1: Introduction (0:00-0:20)

**[Show screen with FirstLine 2.0 logo and title card]**

**Narration:**
"This is FirstLine 2.0 - an AI-powered clinical decision support system designed for low-resource healthcare settings. Using Google's MedGemma medical AI model, FirstLine provides rapid triage assessment within seconds, enabling healthcare workers to prioritize patient care and make better clinical decisions.

Today, we'll walk through a real-world patient case."

---

## Scene 2: Login & Navigation (0:20-0:35)

**[Show clinician app login screen]**

**Narration:**
"The clinician enters their credentials to access the secure platform. Authentication is built-in with role-based access control."

**[Type credentials]**
- Email: clinician@hospital.local
- Password: [enter password]

**[Press Login - show successful authentication]**

**Narration:**
"Once logged in, the clinician can create new patient encounters or review existing cases. Let's create a new patient encounter."

**[Click "New Encounter" button]**

---

## Scene 3: Patient Data Entry (0:35-1:20)

**[Show NewEncounter form]**

**Narration:**
"The form collects essential patient demographics and clinical information. Let's enter a real case - a 35-year-old female presenting with fever, cough, and fatigue for 3 days."

**[Fill in form with example data:]**

```
Patient Demographics:
  - Age: 35
  - Sex: Female
  - Location: Urban clinic

Chief Complaint & History:
  - Symptoms: Fever (3 days), persistent cough, fatigue
  - Duration: 72 hours
  - Associated symptoms: Body aches, shortness of breath

Vital Signs:
  - Temperature: 38.5°C
  - Blood Pressure: 125/80 mmHg
  - Heart Rate: 98 bpm

Lab Results (optional):
  - WBC: 7.2 (normal)
  - Hemoglobin: 11.5 g/dL
  - CRP: 45 mg/L (elevated)
```

**[As typing, show form auto-filling]**

**Narration:**
"The system accepts optional lab results, which help refine the AI assessment. Temperature is already elevated, and inflammatory markers show infection. Now let's submit for triage assessment."

**[Click "Run Simulation" button]**

---

## Scene 4: AI Triage Results (1:20-1:50)

**[Show triage results appearing inline]**

**Narration:**
"In just seconds, MedGemma analyzes the patient data and provides a comprehensive triage assessment. Watch as the results appear:"

**[Results display shows:]**

```
TRIAGE RESULT
Risk Tier: ORANGE (Moderate-High Risk)

Primary Assessment:
- Likely diagnosis: Community-acquired respiratory infection
- Differential: Influenza, early pneumonia, viral bronchitis
- Severity: Moderate

Clinical Recommendations:
1. Initiate empiric antibiotic therapy (amoxicillin-clavulanate or similar)
2. Supportive care: antipyretics, hydration, rest
3. Monitor respiratory rate and oxygen saturation
4. Reassess in 48 hours

Safety Notes:
⚠️ Non-diagnostic system - clinician review required
⚠️ If breathing becomes difficult, seek immediate care
```

**Narration:**
"The system identifies moderate-to-high risk and recommends respiratory infection protocols. Notice the safety disclaimers - FirstLine is designed to support, not replace, clinical judgment. The AI provides differential diagnoses and next-step recommendations."

---

## Scene 5: Follow-up Questions (1:50-2:15)

**[Show follow-up questions section]**

**Narration:**
"The system automatically generates follow-up questions to refine the assessment. Let's answer these to improve accuracy."

**[Show questions:]**
- "Has the patient had recent sick contacts?" → "Yes, coworker with respiratory illness"
- "Any chest pain with breathing?" → "Mild chest discomfort on deep breathing"
- "Current medications?" → "No medications, no allergies"

**[Click "Resubmit with Follow-up Answers"]**

**[New refined results appear:]**

```
UPDATED ASSESSMENT
Risk Tier: ORANGE → ORANGE (Confirmed)
Additional Finding: Possible early pleurisy
Revised Recommendation: Consider chest imaging (CXR) if available
```

**Narration:**
"The follow-up responses help the AI refine its assessment. This multi-round interaction enables better clinical decision-making, especially in resource-limited settings where clinicians can't easily access specialist opinions."

---

## Scene 6: Referral & SOAP Documentation (2:15-2:45)

**[Click "Generate Referral" button]**

**[Show hospital selection dropdown]**

**Narration:**
"When specialist care is needed, FirstLine generates a structured SOAP referral document that can be sent directly to hospitals or health centers. The clinician selects the destination facility."

**[Select: "Central Teaching Hospital"]**

**[Click "Generate SOAP Referral"]**

**[Show PDF generating and downloading]**

**[Display SOAP document on screen:]**

```
FIRSTLINE REFERRAL DOCUMENT
═══════════════════════════════════════

SUBJECTIVE:
35-year-old female presents with 3-day history of fever, productive
cough, and fatigue. Associated with body aches and mild chest
discomfort. Recent sick contact (coworker). No significant past
medical history.

OBJECTIVE:
Temperature: 38.5°C, BP: 125/80, HR: 98, RR: 22
Labs: WBC 7.2, Hgb 11.5, CRP 45 (elevated)
Lungs: Clear on auscultation, chest tenderness noted

ASSESSMENT:
Community-acquired respiratory infection (likely viral or early
bacterial pneumonia). Moderate-to-high risk case. Possible pleurisy.

PLAN:
1. Initiate empiric antibiotic therapy
2. Supportive care and hydration
3. Arrange CXR imaging if available
4. Follow-up in 48 hours
5. Refer to Central Teaching Hospital if symptoms worsen

AI System: FirstLine 2.0 (MedGemma-4b-it)
Clinician Review: Required
═══════════════════════════════════════
```

**Narration:**
"The system generates a professional, concise referral document with all clinical findings. This document can be downloaded, printed, or sent digitally to the receiving facility. The non-diagnostic disclaimer is included to maintain safety and legal compliance."

---

## Scene 7: Edge & Offline Capabilities (2:45-3:00)

**[Show slide/graphic of edge deployment architecture]**

**Narration:**
"FirstLine 2.0 can run entirely offline on edge devices like Raspberry Pi or Jetson Nano, using the same MedGemma model. Healthcare workers in remote areas without internet can:

- Assess patients with full AI triage capability
- Collect patient data locally
- Sync with cloud systems when connectivity returns

This breakthrough enables clinical decision support in the world's most underserved healthcare settings."

**[Show graphic: Clinic with Raspberry Pi → Mobile users → Cloud sync]**

---

## Scene 8: Closing (3:00-3:20)

**[Show FirstLine 2.0 dashboard with patient summary]**

**Narration:**
"FirstLine 2.0 democratizes AI-powered clinical decision support. Whether deployed in hospitals, clinics, mobile health units, or remote edge devices, the system provides:

✓ Rapid triage assessment in seconds
✓ Evidence-based recommendations
✓ Multi-round interactive refinement
✓ Structured referral generation
✓ Full offline capability

Built for healthcare workers serving the world's most underserved populations. Thank you."

**[Show logo and project links slide]**

```
FirstLine 2.0 - AI Clinical Decision Support
GitHub: [repo link]
Kaggle: MedGemma Impact Challenge
License: CC-BY-4.0
```

---

## Demo Script Notes

### **Timing Breakdown:**
- Introduction: 20 seconds
- Login & Navigation: 15 seconds
- Patient Data Entry: 45 seconds
- Triage Results: 30 seconds
- Follow-up Questions: 25 seconds
- Referral & SOAP: 30 seconds
- Edge Capabilities: 15 seconds
- Closing: 20 seconds
- **Total: ~3 minutes**

### **Key Points to Emphasize:**
1. **Speed**: Results in seconds, not hours
2. **Safety**: Non-diagnostic with clear disclaimers
3. **Offline**: Works without internet
4. **Structure**: SOAP format for professional referrals
5. **Refinement**: Interactive multi-round assessment
6. **Inclusivity**: Built for low-resource settings

### **Technical Setup for Recording:**
- Browser: Chrome/Safari with responsive design (1280x800)
- Tools: OBS Studio, ScreenFlow, or Camtasia
- Audio: Clear mic, background noise minimal
- Pace: Slow typing, clear clicks, pause between major sections
- Font Size: Increase to 130% for screen recording visibility

### **Optional Visual Enhancements:**
- Add subtle animations when results appear
- Highlight key numbers (Risk Tier, timestamps)
- Zoom into form fields as filling
- Show cursor clearly for interactions
- Use screen annotations for key findings

---

## Recording Checklist

Before you record, ensure:

- [ ] Backend is running (`npm start` or deployed)
- [ ] Clinician app is accessible (http://localhost:3000)
- [ ] Sample test patient data is ready
- [ ] MedGemma is accessible (Kaggle or HuggingFace)
- [ ] Network latency is low (results appear quickly)
- [ ] Audio is clear (USB mic recommended)
- [ ] Screen resolution is 1280x800 or higher
- [ ] You have 5-10 minutes of uninterrupted time
- [ ] All tabs/notifications are closed
- [ ] Recording software is tested

---

## Post-Recording

1. Edit the video to exact 3 minutes or under
2. Upload to YouTube (unlisted) or Google Drive
3. Get shareable link
4. Add to KAGGLE_WRITEUP_WITH_EDGE.md:
   ```markdown
   **Video Demo:** [Your video link here]
   ```
5. Submit to Kaggle competition

---

**Good luck with your submission! 🎥✨**
