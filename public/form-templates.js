// public/form-templates.js — pre-built intake form templates,
// one per practitioner type, each starting from a shared Core Client
// Details block. Selectable when creating a new form (and, later,
// during onboarding) so a practitioner doesn't have to build an intake
// form from a blank page.
const INTAKE_FORM_TEMPLATES = [
  {
    "key": "kinesiologist",
    "name": "Kinesiologist",
    "serviceCategory": "kinesiology",
    "fields": [
      {
        "id": "core1",
        "type": "section",
        "label": "Personal Information"
      },
      {
        "id": "core2",
        "type": "text",
        "label": "Full name",
        "required": true
      },
      {
        "id": "core3",
        "type": "text",
        "label": "Preferred name / pronouns",
        "required": false
      },
      {
        "id": "core4",
        "type": "text",
        "label": "Date of birth (DD/MM/YYYY)",
        "required": true
      },
      {
        "id": "core5",
        "type": "dropdown",
        "label": "Gender",
        "options": [
          "Female",
          "Male",
          "Non-binary",
          "Prefer to self-describe",
          "Prefer not to say"
        ],
        "required": false
      },
      {
        "id": "core6",
        "type": "text",
        "label": "Address",
        "required": false
      },
      {
        "id": "core7",
        "type": "text",
        "label": "Phone (mobile or home)",
        "required": true
      },
      {
        "id": "core8",
        "type": "text",
        "label": "Email",
        "required": true
      },
      {
        "id": "core9",
        "type": "text",
        "label": "Occupation",
        "required": false
      },
      {
        "id": "core10",
        "type": "text",
        "label": "Emergency contact \u2014 name",
        "required": true
      },
      {
        "id": "core11",
        "type": "text",
        "label": "Emergency contact \u2014 relationship",
        "required": false
      },
      {
        "id": "core12",
        "type": "text",
        "label": "Emergency contact \u2014 phone",
        "required": true
      },
      {
        "id": "core13",
        "type": "section",
        "label": "Referral & Access"
      },
      {
        "id": "core14",
        "type": "dropdown",
        "label": "How did you hear about us?",
        "options": [
          "Google search",
          "Social media",
          "Friend or family referral",
          "Referring practitioner",
          "Other"
        ],
        "required": false
      },
      {
        "id": "core15",
        "type": "text",
        "label": "Referring practitioner (if any)",
        "required": false
      },
      {
        "id": "core16",
        "type": "text",
        "label": "GP name and clinic (if applicable)",
        "required": false
      },
      {
        "id": "core17",
        "type": "section",
        "label": "Consent"
      },
      {
        "id": "core18",
        "type": "choice",
        "label": "I consent to treatment",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "core19",
        "type": "choice",
        "label": "I consent to being contacted via SMS/email for appointment reminders",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "core20",
        "type": "choice",
        "label": "I acknowledge the privacy policy",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "core21",
        "type": "choice",
        "label": "I consent to photo/video (if relevant to this practice)",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": false
      },
      {
        "id": "core22",
        "type": "text",
        "label": "Signature (type full name)",
        "required": true
      },
      {
        "id": "core23",
        "type": "text",
        "label": "Date signed",
        "required": true
      },
      {
        "id": "kin1",
        "type": "section",
        "label": "Presenting Concern"
      },
      {
        "id": "kin2",
        "type": "text",
        "label": "What brings you in today?",
        "required": true
      },
      {
        "id": "kin3",
        "type": "text",
        "label": "How long has this been present?",
        "required": false
      },
      {
        "id": "kin4",
        "type": "choice",
        "label": "Is this the first time you've experienced this, or is it recurring?",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": false
      },
      {
        "id": "kin5",
        "type": "section",
        "label": "Health & Lifestyle"
      },
      {
        "id": "kin6",
        "type": "text",
        "label": "Current medications and supplements",
        "required": false
      },
      {
        "id": "kin7",
        "type": "text",
        "label": "Known allergies or sensitivities",
        "required": false
      },
      {
        "id": "kin8",
        "type": "text",
        "label": "Diagnosed medical conditions",
        "required": false
      },
      {
        "id": "kin9",
        "type": "scale",
        "label": "Stress levels",
        "scaleStyle": "number",
        "min": 1,
        "max": 10,
        "minLabel": "Not at all",
        "maxLabel": "Extremely",
        "required": false
      },
      {
        "id": "kin10",
        "type": "text",
        "label": "Main stressors",
        "required": false
      },
      {
        "id": "kin11",
        "type": "dropdown",
        "label": "Sleep quality",
        "options": [
          "Excellent",
          "Good",
          "Fair",
          "Poor"
        ],
        "required": false
      },
      {
        "id": "kin12",
        "type": "text",
        "label": "Diet overview (typical day)",
        "required": false
      },
      {
        "id": "kin13",
        "type": "text",
        "label": "Exercise / movement habits",
        "required": false
      },
      {
        "id": "kin14",
        "type": "text",
        "label": "Water intake (approx. per day)",
        "required": false
      },
      {
        "id": "kin15",
        "type": "section",
        "label": "Kinesiology-Specific"
      },
      {
        "id": "kin16",
        "type": "choice",
        "label": "Previous experience with kinesiology or muscle testing",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": false
      },
      {
        "id": "kin17",
        "type": "choice",
        "label": "Comfortable with light touch / hands-on work",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "kin18",
        "type": "choice",
        "label": "Preferred focus",
        "options": [
          "Emotional",
          "Physical",
          "Nutritional",
          "Open to all"
        ],
        "multi": false,
        "required": false
      },
      {
        "id": "kin19",
        "type": "text",
        "label": "Any areas of the body to avoid touching",
        "required": false
      },
      {
        "id": "kin20",
        "type": "text",
        "label": "Goals for this session / ongoing work",
        "required": false
      }
    ]
  },
  {
    "key": "reiki",
    "name": "Reiki",
    "serviceCategory": "reiki",
    "fields": [
      {
        "id": "core24",
        "type": "section",
        "label": "Personal Information"
      },
      {
        "id": "core25",
        "type": "text",
        "label": "Full name",
        "required": true
      },
      {
        "id": "core26",
        "type": "text",
        "label": "Preferred name / pronouns",
        "required": false
      },
      {
        "id": "core27",
        "type": "text",
        "label": "Date of birth (DD/MM/YYYY)",
        "required": true
      },
      {
        "id": "core28",
        "type": "dropdown",
        "label": "Gender",
        "options": [
          "Female",
          "Male",
          "Non-binary",
          "Prefer to self-describe",
          "Prefer not to say"
        ],
        "required": false
      },
      {
        "id": "core29",
        "type": "text",
        "label": "Address",
        "required": false
      },
      {
        "id": "core30",
        "type": "text",
        "label": "Phone (mobile or home)",
        "required": true
      },
      {
        "id": "core31",
        "type": "text",
        "label": "Email",
        "required": true
      },
      {
        "id": "core32",
        "type": "text",
        "label": "Occupation",
        "required": false
      },
      {
        "id": "core33",
        "type": "text",
        "label": "Emergency contact \u2014 name",
        "required": true
      },
      {
        "id": "core34",
        "type": "text",
        "label": "Emergency contact \u2014 relationship",
        "required": false
      },
      {
        "id": "core35",
        "type": "text",
        "label": "Emergency contact \u2014 phone",
        "required": true
      },
      {
        "id": "core36",
        "type": "section",
        "label": "Referral & Access"
      },
      {
        "id": "core37",
        "type": "dropdown",
        "label": "How did you hear about us?",
        "options": [
          "Google search",
          "Social media",
          "Friend or family referral",
          "Referring practitioner",
          "Other"
        ],
        "required": false
      },
      {
        "id": "core38",
        "type": "text",
        "label": "Referring practitioner (if any)",
        "required": false
      },
      {
        "id": "core39",
        "type": "text",
        "label": "GP name and clinic (if applicable)",
        "required": false
      },
      {
        "id": "core40",
        "type": "section",
        "label": "Consent"
      },
      {
        "id": "core41",
        "type": "choice",
        "label": "I consent to treatment",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "core42",
        "type": "choice",
        "label": "I consent to being contacted via SMS/email for appointment reminders",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "core43",
        "type": "choice",
        "label": "I acknowledge the privacy policy",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "core44",
        "type": "choice",
        "label": "I consent to photo/video (if relevant to this practice)",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": false
      },
      {
        "id": "core45",
        "type": "text",
        "label": "Signature (type full name)",
        "required": true
      },
      {
        "id": "core46",
        "type": "text",
        "label": "Date signed",
        "required": true
      },
      {
        "id": "rei1",
        "type": "section",
        "label": "Presenting Concern"
      },
      {
        "id": "rei2",
        "type": "text",
        "label": "What are you hoping to address or shift (physical, emotional, energetic)?",
        "required": true
      },
      {
        "id": "rei3",
        "type": "scale",
        "label": "Current stress or anxiety levels",
        "scaleStyle": "number",
        "min": 1,
        "max": 10,
        "minLabel": "Not at all",
        "maxLabel": "Extremely",
        "required": false
      },
      {
        "id": "rei4",
        "type": "text",
        "label": "Areas of tension or discomfort in the body",
        "required": false
      },
      {
        "id": "rei5",
        "type": "section",
        "label": "Health Background"
      },
      {
        "id": "rei6",
        "type": "text",
        "label": "Current medications, treatments, or therapies",
        "required": false
      },
      {
        "id": "rei7",
        "type": "choice",
        "label": "Currently pregnant (some hand positions are adjusted)",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": false
      },
      {
        "id": "rei8",
        "type": "choice",
        "label": "Pacemaker or other implanted medical device",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "rei9",
        "type": "choice",
        "label": "History of seizures or fainting",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "rei10",
        "type": "text",
        "label": "Recent surgeries or injuries",
        "required": false
      },
      {
        "id": "rei11",
        "type": "section",
        "label": "Reiki-Specific"
      },
      {
        "id": "rei12",
        "type": "choice",
        "label": "Previous Reiki or energy work experience",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": false
      },
      {
        "id": "rei13",
        "type": "choice",
        "label": "Preference",
        "options": [
          "Hands-on",
          "Hands-off (above the body)"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "rei14",
        "type": "choice",
        "label": "During the session, I'd prefer",
        "options": [
          "Silence",
          "Music"
        ],
        "multi": false,
        "required": false
      },
      {
        "id": "rei15",
        "type": "choice",
        "label": "Open to emotional release during/after treatment",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": false
      },
      {
        "id": "rei16",
        "type": "text",
        "label": "Any areas of the body you'd prefer not to be touched",
        "required": false
      },
      {
        "id": "rei17",
        "type": "text",
        "label": "Intentions or areas of focus for the session",
        "required": false
      }
    ]
  },
  {
    "key": "psychologist",
    "name": "Psychologist",
    "serviceCategory": "psychology",
    "fields": [
      {
        "id": "core47",
        "type": "section",
        "label": "Personal Information"
      },
      {
        "id": "core48",
        "type": "text",
        "label": "Full name",
        "required": true
      },
      {
        "id": "core49",
        "type": "text",
        "label": "Preferred name / pronouns",
        "required": false
      },
      {
        "id": "core50",
        "type": "text",
        "label": "Date of birth (DD/MM/YYYY)",
        "required": true
      },
      {
        "id": "core51",
        "type": "dropdown",
        "label": "Gender",
        "options": [
          "Female",
          "Male",
          "Non-binary",
          "Prefer to self-describe",
          "Prefer not to say"
        ],
        "required": false
      },
      {
        "id": "core52",
        "type": "text",
        "label": "Address",
        "required": false
      },
      {
        "id": "core53",
        "type": "text",
        "label": "Phone (mobile or home)",
        "required": true
      },
      {
        "id": "core54",
        "type": "text",
        "label": "Email",
        "required": true
      },
      {
        "id": "core55",
        "type": "text",
        "label": "Occupation",
        "required": false
      },
      {
        "id": "core56",
        "type": "text",
        "label": "Emergency contact \u2014 name",
        "required": true
      },
      {
        "id": "core57",
        "type": "text",
        "label": "Emergency contact \u2014 relationship",
        "required": false
      },
      {
        "id": "core58",
        "type": "text",
        "label": "Emergency contact \u2014 phone",
        "required": true
      },
      {
        "id": "core59",
        "type": "section",
        "label": "Referral & Access"
      },
      {
        "id": "core60",
        "type": "dropdown",
        "label": "How did you hear about us?",
        "options": [
          "Google search",
          "Social media",
          "Friend or family referral",
          "Referring practitioner",
          "Other"
        ],
        "required": false
      },
      {
        "id": "core61",
        "type": "text",
        "label": "Referring practitioner (if any)",
        "required": false
      },
      {
        "id": "core62",
        "type": "text",
        "label": "GP name and clinic (if applicable)",
        "required": false
      },
      {
        "id": "core63",
        "type": "section",
        "label": "Consent"
      },
      {
        "id": "core64",
        "type": "choice",
        "label": "I consent to treatment",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "core65",
        "type": "choice",
        "label": "I consent to being contacted via SMS/email for appointment reminders",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "core66",
        "type": "choice",
        "label": "I acknowledge the privacy policy",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "core67",
        "type": "choice",
        "label": "I consent to photo/video (if relevant to this practice)",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": false
      },
      {
        "id": "core68",
        "type": "text",
        "label": "Signature (type full name)",
        "required": true
      },
      {
        "id": "core69",
        "type": "text",
        "label": "Date signed",
        "required": true
      },
      {
        "id": "psy1",
        "type": "section",
        "label": "Presenting Concern"
      },
      {
        "id": "psy2",
        "type": "text",
        "label": "What has brought you to therapy at this time?",
        "required": true
      },
      {
        "id": "psy3",
        "type": "text",
        "label": "How long have you been experiencing this?",
        "required": false
      },
      {
        "id": "psy4",
        "type": "scale",
        "label": "Impact on daily functioning (work, relationships, self-care)",
        "scaleStyle": "number",
        "min": 1,
        "max": 10,
        "minLabel": "Minimal",
        "maxLabel": "Severe",
        "required": false
      },
      {
        "id": "psy5",
        "type": "section",
        "label": "Mental Health History"
      },
      {
        "id": "psy6",
        "type": "text",
        "label": "Previous mental health diagnoses",
        "required": false
      },
      {
        "id": "psy7",
        "type": "text",
        "label": "Previous therapy or psychiatric treatment (dates, provider, outcome)",
        "required": false
      },
      {
        "id": "psy8",
        "type": "text",
        "label": "Current or past psychiatric medications",
        "required": false
      },
      {
        "id": "psy9",
        "type": "text",
        "label": "Family history of mental illness",
        "required": false
      },
      {
        "id": "psy10",
        "type": "text",
        "label": "History of trauma (share only what you're comfortable with)",
        "required": false
      },
      {
        "id": "psy11",
        "type": "paragraph",
        "text": "The next three questions are important for your safety. Please answer honestly \u2014 your practitioner will follow up with you directly and confidentially."
      },
      {
        "id": "psy12",
        "type": "choice",
        "label": "Are you currently having thoughts of self-harm or suicide?",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "psy13",
        "type": "choice",
        "label": "Are you currently having thoughts of harming someone else?",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "psy14",
        "type": "text",
        "label": "Substance use (alcohol, tobacco, other)",
        "required": false
      },
      {
        "id": "psy15",
        "type": "section",
        "label": "Psychosocial"
      },
      {
        "id": "psy16",
        "type": "text",
        "label": "Living situation and household",
        "required": false
      },
      {
        "id": "psy17",
        "type": "text",
        "label": "Relationship status and quality of key relationships",
        "required": false
      },
      {
        "id": "psy18",
        "type": "text",
        "label": "Employment/study status and satisfaction",
        "required": false
      },
      {
        "id": "psy19",
        "type": "text",
        "label": "Support network",
        "required": false
      },
      {
        "id": "psy20",
        "type": "text",
        "label": "Current stressors",
        "required": false
      },
      {
        "id": "psy21",
        "type": "section",
        "label": "Administrative"
      },
      {
        "id": "psy22",
        "type": "text",
        "label": "GP details and referral / Mental Health Care Plan (if applicable)",
        "required": false
      },
      {
        "id": "psy23",
        "type": "text",
        "label": "Private health insurance details",
        "required": false
      },
      {
        "id": "psy24",
        "type": "choice",
        "label": "I consent for my practitioner to liaise with my GP or other treating professionals",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": false
      },
      {
        "id": "psy25",
        "type": "choice",
        "label": "I acknowledge the confidentiality policy and its limits (duty of care disclosures)",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      }
    ]
  },
  {
    "key": "counsellor",
    "name": "Counsellor",
    "serviceCategory": "counselling",
    "fields": [
      {
        "id": "core70",
        "type": "section",
        "label": "Personal Information"
      },
      {
        "id": "core71",
        "type": "text",
        "label": "Full name",
        "required": true
      },
      {
        "id": "core72",
        "type": "text",
        "label": "Preferred name / pronouns",
        "required": false
      },
      {
        "id": "core73",
        "type": "text",
        "label": "Date of birth (DD/MM/YYYY)",
        "required": true
      },
      {
        "id": "core74",
        "type": "dropdown",
        "label": "Gender",
        "options": [
          "Female",
          "Male",
          "Non-binary",
          "Prefer to self-describe",
          "Prefer not to say"
        ],
        "required": false
      },
      {
        "id": "core75",
        "type": "text",
        "label": "Address",
        "required": false
      },
      {
        "id": "core76",
        "type": "text",
        "label": "Phone (mobile or home)",
        "required": true
      },
      {
        "id": "core77",
        "type": "text",
        "label": "Email",
        "required": true
      },
      {
        "id": "core78",
        "type": "text",
        "label": "Occupation",
        "required": false
      },
      {
        "id": "core79",
        "type": "text",
        "label": "Emergency contact \u2014 name",
        "required": true
      },
      {
        "id": "core80",
        "type": "text",
        "label": "Emergency contact \u2014 relationship",
        "required": false
      },
      {
        "id": "core81",
        "type": "text",
        "label": "Emergency contact \u2014 phone",
        "required": true
      },
      {
        "id": "core82",
        "type": "section",
        "label": "Referral & Access"
      },
      {
        "id": "core83",
        "type": "dropdown",
        "label": "How did you hear about us?",
        "options": [
          "Google search",
          "Social media",
          "Friend or family referral",
          "Referring practitioner",
          "Other"
        ],
        "required": false
      },
      {
        "id": "core84",
        "type": "text",
        "label": "Referring practitioner (if any)",
        "required": false
      },
      {
        "id": "core85",
        "type": "text",
        "label": "GP name and clinic (if applicable)",
        "required": false
      },
      {
        "id": "core86",
        "type": "section",
        "label": "Consent"
      },
      {
        "id": "core87",
        "type": "choice",
        "label": "I consent to treatment",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "core88",
        "type": "choice",
        "label": "I consent to being contacted via SMS/email for appointment reminders",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "core89",
        "type": "choice",
        "label": "I acknowledge the privacy policy",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "core90",
        "type": "choice",
        "label": "I consent to photo/video (if relevant to this practice)",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": false
      },
      {
        "id": "core91",
        "type": "text",
        "label": "Signature (type full name)",
        "required": true
      },
      {
        "id": "core92",
        "type": "text",
        "label": "Date signed",
        "required": true
      },
      {
        "id": "cou1",
        "type": "section",
        "label": "Presenting Concern"
      },
      {
        "id": "cou2",
        "type": "text",
        "label": "What would you like support with?",
        "required": true
      },
      {
        "id": "cou3",
        "type": "text",
        "label": "How long has this been affecting you?",
        "required": false
      },
      {
        "id": "cou4",
        "type": "text",
        "label": "What does a good outcome look like for you?",
        "required": false
      },
      {
        "id": "cou5",
        "type": "section",
        "label": "Background"
      },
      {
        "id": "cou6",
        "type": "text",
        "label": "Relevant life history relating to the presenting issue (share as much as you wish)",
        "required": false
      },
      {
        "id": "cou7",
        "type": "text",
        "label": "Current relationships and support systems",
        "required": false
      },
      {
        "id": "cou8",
        "type": "text",
        "label": "Coping strategies currently used",
        "required": false
      },
      {
        "id": "cou9",
        "type": "choice",
        "label": "Previous counselling experience",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": false
      },
      {
        "id": "cou10",
        "type": "section",
        "label": "Wellbeing Check"
      },
      {
        "id": "cou11",
        "type": "scale",
        "label": "Current mood/stress levels",
        "scaleStyle": "number",
        "min": 1,
        "max": 10,
        "minLabel": "Low",
        "maxLabel": "High",
        "required": false
      },
      {
        "id": "cou12",
        "type": "dropdown",
        "label": "Sleep",
        "options": [
          "Good",
          "Fair",
          "Poor"
        ],
        "required": false
      },
      {
        "id": "cou13",
        "type": "dropdown",
        "label": "Appetite",
        "options": [
          "Good",
          "Fair",
          "Poor"
        ],
        "required": false
      },
      {
        "id": "cou14",
        "type": "paragraph",
        "text": "This question is important for your safety and will be followed up directly and confidentially."
      },
      {
        "id": "cou15",
        "type": "choice",
        "label": "Do you have any current safety concerns for yourself or others?",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "cou16",
        "type": "text",
        "label": "Substance use",
        "required": false
      },
      {
        "id": "cou17",
        "type": "section",
        "label": "Administrative"
      },
      {
        "id": "cou18",
        "type": "choice",
        "label": "Preferred session style",
        "options": [
          "Talk therapy",
          "Structured exercises",
          "A mix of both",
          "Not sure yet"
        ],
        "multi": false,
        "required": false
      },
      {
        "id": "cou19",
        "type": "choice",
        "label": "I acknowledge the confidentiality policy and its limits",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "cou20",
        "type": "choice",
        "label": "I consent to record-keeping and any relevant referrals",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      }
    ]
  },
  {
    "key": "naturopath",
    "name": "Naturopath",
    "serviceCategory": "naturopathy",
    "fields": [
      {
        "id": "core93",
        "type": "section",
        "label": "Personal Information"
      },
      {
        "id": "core94",
        "type": "text",
        "label": "Full name",
        "required": true
      },
      {
        "id": "core95",
        "type": "text",
        "label": "Preferred name / pronouns",
        "required": false
      },
      {
        "id": "core96",
        "type": "text",
        "label": "Date of birth (DD/MM/YYYY)",
        "required": true
      },
      {
        "id": "core97",
        "type": "dropdown",
        "label": "Gender",
        "options": [
          "Female",
          "Male",
          "Non-binary",
          "Prefer to self-describe",
          "Prefer not to say"
        ],
        "required": false
      },
      {
        "id": "core98",
        "type": "text",
        "label": "Address",
        "required": false
      },
      {
        "id": "core99",
        "type": "text",
        "label": "Phone (mobile or home)",
        "required": true
      },
      {
        "id": "core100",
        "type": "text",
        "label": "Email",
        "required": true
      },
      {
        "id": "core101",
        "type": "text",
        "label": "Occupation",
        "required": false
      },
      {
        "id": "core102",
        "type": "text",
        "label": "Emergency contact \u2014 name",
        "required": true
      },
      {
        "id": "core103",
        "type": "text",
        "label": "Emergency contact \u2014 relationship",
        "required": false
      },
      {
        "id": "core104",
        "type": "text",
        "label": "Emergency contact \u2014 phone",
        "required": true
      },
      {
        "id": "core105",
        "type": "section",
        "label": "Referral & Access"
      },
      {
        "id": "core106",
        "type": "dropdown",
        "label": "How did you hear about us?",
        "options": [
          "Google search",
          "Social media",
          "Friend or family referral",
          "Referring practitioner",
          "Other"
        ],
        "required": false
      },
      {
        "id": "core107",
        "type": "text",
        "label": "Referring practitioner (if any)",
        "required": false
      },
      {
        "id": "core108",
        "type": "text",
        "label": "GP name and clinic (if applicable)",
        "required": false
      },
      {
        "id": "core109",
        "type": "section",
        "label": "Consent"
      },
      {
        "id": "core110",
        "type": "choice",
        "label": "I consent to treatment",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "core111",
        "type": "choice",
        "label": "I consent to being contacted via SMS/email for appointment reminders",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "core112",
        "type": "choice",
        "label": "I acknowledge the privacy policy",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "core113",
        "type": "choice",
        "label": "I consent to photo/video (if relevant to this practice)",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": false
      },
      {
        "id": "core114",
        "type": "text",
        "label": "Signature (type full name)",
        "required": true
      },
      {
        "id": "core115",
        "type": "text",
        "label": "Date signed",
        "required": true
      },
      {
        "id": "nat1",
        "type": "section",
        "label": "Presenting Concern"
      },
      {
        "id": "nat2",
        "type": "text",
        "label": "Main health concern(s), in order of priority",
        "required": true
      },
      {
        "id": "nat3",
        "type": "text",
        "label": "Duration and pattern of symptoms",
        "required": false
      },
      {
        "id": "nat4",
        "type": "text",
        "label": "What makes it better or worse?",
        "required": false
      },
      {
        "id": "nat5",
        "type": "section",
        "label": "Health History"
      },
      {
        "id": "nat6",
        "type": "text",
        "label": "Full medical history (past and current conditions)",
        "required": false
      },
      {
        "id": "nat7",
        "type": "text",
        "label": "Current medications and supplements (including dosage)",
        "required": false
      },
      {
        "id": "nat8",
        "type": "text",
        "label": "Family medical history",
        "required": false
      },
      {
        "id": "nat9",
        "type": "text",
        "label": "Surgical history",
        "required": false
      },
      {
        "id": "nat10",
        "type": "text",
        "label": "Allergies and intolerances",
        "required": false
      },
      {
        "id": "nat11",
        "type": "section",
        "label": "Systems Review"
      },
      {
        "id": "nat12",
        "type": "text",
        "label": "Digestive health (bowel habits, bloating, reflux, etc.)",
        "required": false
      },
      {
        "id": "nat13",
        "type": "scale",
        "label": "Energy levels",
        "scaleStyle": "number",
        "min": 1,
        "max": 10,
        "minLabel": "Low",
        "maxLabel": "High",
        "required": false
      },
      {
        "id": "nat14",
        "type": "dropdown",
        "label": "Sleep quality",
        "options": [
          "Excellent",
          "Good",
          "Fair",
          "Poor"
        ],
        "required": false
      },
      {
        "id": "nat15",
        "type": "text",
        "label": "Hormonal health / menstrual cycle (if applicable)",
        "required": false
      },
      {
        "id": "nat16",
        "type": "text",
        "label": "Skin, hair, and nail health",
        "required": false
      },
      {
        "id": "nat17",
        "type": "text",
        "label": "Mood and stress",
        "required": false
      },
      {
        "id": "nat18",
        "type": "text",
        "label": "Immune function (frequency of colds/illness)",
        "required": false
      },
      {
        "id": "nat19",
        "type": "section",
        "label": "Lifestyle"
      },
      {
        "id": "nat20",
        "type": "text",
        "label": "Typical daily diet (or food diary if available)",
        "required": false
      },
      {
        "id": "nat21",
        "type": "text",
        "label": "Water intake",
        "required": false
      },
      {
        "id": "nat22",
        "type": "text",
        "label": "Exercise routine",
        "required": false
      },
      {
        "id": "nat23",
        "type": "text",
        "label": "Alcohol, caffeine, tobacco, recreational substance use",
        "required": false
      },
      {
        "id": "nat24",
        "type": "text",
        "label": "Occupational and environmental exposures",
        "required": false
      },
      {
        "id": "nat25",
        "type": "section",
        "label": "Goals"
      },
      {
        "id": "nat26",
        "type": "text",
        "label": "Primary health goals",
        "required": true
      },
      {
        "id": "nat27",
        "type": "choice",
        "label": "Open to dietary/lifestyle changes",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": false
      },
      {
        "id": "nat28",
        "type": "text",
        "label": "Budget considerations for supplements/testing",
        "required": false
      }
    ]
  },
  {
    "key": "energy-worker",
    "name": "Energy Worker",
    "serviceCategory": "energy-work",
    "fields": [
      {
        "id": "core116",
        "type": "section",
        "label": "Personal Information"
      },
      {
        "id": "core117",
        "type": "text",
        "label": "Full name",
        "required": true
      },
      {
        "id": "core118",
        "type": "text",
        "label": "Preferred name / pronouns",
        "required": false
      },
      {
        "id": "core119",
        "type": "text",
        "label": "Date of birth (DD/MM/YYYY)",
        "required": true
      },
      {
        "id": "core120",
        "type": "dropdown",
        "label": "Gender",
        "options": [
          "Female",
          "Male",
          "Non-binary",
          "Prefer to self-describe",
          "Prefer not to say"
        ],
        "required": false
      },
      {
        "id": "core121",
        "type": "text",
        "label": "Address",
        "required": false
      },
      {
        "id": "core122",
        "type": "text",
        "label": "Phone (mobile or home)",
        "required": true
      },
      {
        "id": "core123",
        "type": "text",
        "label": "Email",
        "required": true
      },
      {
        "id": "core124",
        "type": "text",
        "label": "Occupation",
        "required": false
      },
      {
        "id": "core125",
        "type": "text",
        "label": "Emergency contact \u2014 name",
        "required": true
      },
      {
        "id": "core126",
        "type": "text",
        "label": "Emergency contact \u2014 relationship",
        "required": false
      },
      {
        "id": "core127",
        "type": "text",
        "label": "Emergency contact \u2014 phone",
        "required": true
      },
      {
        "id": "core128",
        "type": "section",
        "label": "Referral & Access"
      },
      {
        "id": "core129",
        "type": "dropdown",
        "label": "How did you hear about us?",
        "options": [
          "Google search",
          "Social media",
          "Friend or family referral",
          "Referring practitioner",
          "Other"
        ],
        "required": false
      },
      {
        "id": "core130",
        "type": "text",
        "label": "Referring practitioner (if any)",
        "required": false
      },
      {
        "id": "core131",
        "type": "text",
        "label": "GP name and clinic (if applicable)",
        "required": false
      },
      {
        "id": "core132",
        "type": "section",
        "label": "Consent"
      },
      {
        "id": "core133",
        "type": "choice",
        "label": "I consent to treatment",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "core134",
        "type": "choice",
        "label": "I consent to being contacted via SMS/email for appointment reminders",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "core135",
        "type": "choice",
        "label": "I acknowledge the privacy policy",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "core136",
        "type": "choice",
        "label": "I consent to photo/video (if relevant to this practice)",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": false
      },
      {
        "id": "core137",
        "type": "text",
        "label": "Signature (type full name)",
        "required": true
      },
      {
        "id": "core138",
        "type": "text",
        "label": "Date signed",
        "required": true
      },
      {
        "id": "ene1",
        "type": "section",
        "label": "Presenting Concern"
      },
      {
        "id": "ene2",
        "type": "text",
        "label": "What are you seeking support with (physical, emotional, spiritual)?",
        "required": true
      },
      {
        "id": "ene3",
        "type": "text",
        "label": "Current life stressors or transitions",
        "required": false
      },
      {
        "id": "ene4",
        "type": "text",
        "label": "Areas of the body/energy field you sense are blocked or heavy",
        "required": false
      },
      {
        "id": "ene5",
        "type": "section",
        "label": "Health Background"
      },
      {
        "id": "ene6",
        "type": "text",
        "label": "Relevant medical conditions",
        "required": false
      },
      {
        "id": "ene7",
        "type": "text",
        "label": "Medications or treatments currently undertaken",
        "required": false
      },
      {
        "id": "ene8",
        "type": "choice",
        "label": "Currently pregnant",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": false
      },
      {
        "id": "ene9",
        "type": "text",
        "label": "Sensitivity to sound, light, or scent",
        "required": false
      },
      {
        "id": "ene10",
        "type": "section",
        "label": "Energy Work-Specific"
      },
      {
        "id": "ene11",
        "type": "choice",
        "label": "Previous experience with energy healing modalities",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": false
      },
      {
        "id": "ene12",
        "type": "choice",
        "label": "Preferred modality (if multiple offered)",
        "options": [
          "Sound",
          "Crystal",
          "Chakra balancing",
          "No preference"
        ],
        "multi": false,
        "required": false
      },
      {
        "id": "ene13",
        "type": "choice",
        "label": "Comfort level",
        "options": [
          "Touch work is fine",
          "Non-touch only"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "ene14",
        "type": "choice",
        "label": "Open to discussing symbolic/intuitive impressions arising in session",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": false
      },
      {
        "id": "ene15",
        "type": "text",
        "label": "Intentions or focus areas",
        "required": false
      }
    ]
  },
  {
    "key": "therapist",
    "name": "Therapist",
    "serviceCategory": "therapy",
    "fields": [
      {
        "id": "core139",
        "type": "section",
        "label": "Personal Information"
      },
      {
        "id": "core140",
        "type": "text",
        "label": "Full name",
        "required": true
      },
      {
        "id": "core141",
        "type": "text",
        "label": "Preferred name / pronouns",
        "required": false
      },
      {
        "id": "core142",
        "type": "text",
        "label": "Date of birth (DD/MM/YYYY)",
        "required": true
      },
      {
        "id": "core143",
        "type": "dropdown",
        "label": "Gender",
        "options": [
          "Female",
          "Male",
          "Non-binary",
          "Prefer to self-describe",
          "Prefer not to say"
        ],
        "required": false
      },
      {
        "id": "core144",
        "type": "text",
        "label": "Address",
        "required": false
      },
      {
        "id": "core145",
        "type": "text",
        "label": "Phone (mobile or home)",
        "required": true
      },
      {
        "id": "core146",
        "type": "text",
        "label": "Email",
        "required": true
      },
      {
        "id": "core147",
        "type": "text",
        "label": "Occupation",
        "required": false
      },
      {
        "id": "core148",
        "type": "text",
        "label": "Emergency contact \u2014 name",
        "required": true
      },
      {
        "id": "core149",
        "type": "text",
        "label": "Emergency contact \u2014 relationship",
        "required": false
      },
      {
        "id": "core150",
        "type": "text",
        "label": "Emergency contact \u2014 phone",
        "required": true
      },
      {
        "id": "core151",
        "type": "section",
        "label": "Referral & Access"
      },
      {
        "id": "core152",
        "type": "dropdown",
        "label": "How did you hear about us?",
        "options": [
          "Google search",
          "Social media",
          "Friend or family referral",
          "Referring practitioner",
          "Other"
        ],
        "required": false
      },
      {
        "id": "core153",
        "type": "text",
        "label": "Referring practitioner (if any)",
        "required": false
      },
      {
        "id": "core154",
        "type": "text",
        "label": "GP name and clinic (if applicable)",
        "required": false
      },
      {
        "id": "core155",
        "type": "section",
        "label": "Consent"
      },
      {
        "id": "core156",
        "type": "choice",
        "label": "I consent to treatment",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "core157",
        "type": "choice",
        "label": "I consent to being contacted via SMS/email for appointment reminders",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "core158",
        "type": "choice",
        "label": "I acknowledge the privacy policy",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "core159",
        "type": "choice",
        "label": "I consent to photo/video (if relevant to this practice)",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": false
      },
      {
        "id": "core160",
        "type": "text",
        "label": "Signature (type full name)",
        "required": true
      },
      {
        "id": "core161",
        "type": "text",
        "label": "Date signed",
        "required": true
      },
      {
        "id": "thr1",
        "type": "section",
        "label": "Presenting Concern"
      },
      {
        "id": "thr2",
        "type": "text",
        "label": "What brings you to therapy?",
        "required": true
      },
      {
        "id": "thr3",
        "type": "text",
        "label": "Onset and duration",
        "required": false
      },
      {
        "id": "thr4",
        "type": "scale",
        "label": "Impact on daily life",
        "scaleStyle": "number",
        "min": 1,
        "max": 10,
        "minLabel": "Minimal",
        "maxLabel": "Severe",
        "required": false
      },
      {
        "id": "thr5",
        "type": "section",
        "label": "Background"
      },
      {
        "id": "thr6",
        "type": "text",
        "label": "Relevant personal/family history",
        "required": false
      },
      {
        "id": "thr7",
        "type": "text",
        "label": "Previous therapy experience and what helped/didn't help",
        "required": false
      },
      {
        "id": "thr8",
        "type": "text",
        "label": "Current medications (psychiatric or other)",
        "required": false
      },
      {
        "id": "thr9",
        "type": "paragraph",
        "text": "This question is important for your safety and will be followed up directly and confidentially."
      },
      {
        "id": "thr10",
        "type": "choice",
        "label": "Do you have any current safety concerns for yourself or others?",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "thr11",
        "type": "section",
        "label": "Current Functioning"
      },
      {
        "id": "thr12",
        "type": "dropdown",
        "label": "Sleep",
        "options": [
          "Good",
          "Fair",
          "Poor"
        ],
        "required": false
      },
      {
        "id": "thr13",
        "type": "dropdown",
        "label": "Appetite",
        "options": [
          "Good",
          "Fair",
          "Poor"
        ],
        "required": false
      },
      {
        "id": "thr14",
        "type": "scale",
        "label": "Energy levels",
        "scaleStyle": "number",
        "min": 1,
        "max": 10,
        "minLabel": "Low",
        "maxLabel": "High",
        "required": false
      },
      {
        "id": "thr15",
        "type": "text",
        "label": "Relationships and support system",
        "required": false
      },
      {
        "id": "thr16",
        "type": "text",
        "label": "Work/study functioning",
        "required": false
      },
      {
        "id": "thr17",
        "type": "text",
        "label": "Substance use",
        "required": false
      },
      {
        "id": "thr18",
        "type": "section",
        "label": "Administrative"
      },
      {
        "id": "thr19",
        "type": "text",
        "label": "Preferred therapeutic approach, if known (CBT, ACT, psychodynamic, etc.)",
        "required": false
      },
      {
        "id": "thr20",
        "type": "choice",
        "label": "I acknowledge the confidentiality policy and its limits",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "thr21",
        "type": "choice",
        "label": "I consent to record-keeping",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      }
    ]
  },
  {
    "key": "osteopath",
    "name": "Osteopath",
    "serviceCategory": "osteopathy",
    "fields": [
      {
        "id": "core162",
        "type": "section",
        "label": "Personal Information"
      },
      {
        "id": "core163",
        "type": "text",
        "label": "Full name",
        "required": true
      },
      {
        "id": "core164",
        "type": "text",
        "label": "Preferred name / pronouns",
        "required": false
      },
      {
        "id": "core165",
        "type": "text",
        "label": "Date of birth (DD/MM/YYYY)",
        "required": true
      },
      {
        "id": "core166",
        "type": "dropdown",
        "label": "Gender",
        "options": [
          "Female",
          "Male",
          "Non-binary",
          "Prefer to self-describe",
          "Prefer not to say"
        ],
        "required": false
      },
      {
        "id": "core167",
        "type": "text",
        "label": "Address",
        "required": false
      },
      {
        "id": "core168",
        "type": "text",
        "label": "Phone (mobile or home)",
        "required": true
      },
      {
        "id": "core169",
        "type": "text",
        "label": "Email",
        "required": true
      },
      {
        "id": "core170",
        "type": "text",
        "label": "Occupation",
        "required": false
      },
      {
        "id": "core171",
        "type": "text",
        "label": "Emergency contact \u2014 name",
        "required": true
      },
      {
        "id": "core172",
        "type": "text",
        "label": "Emergency contact \u2014 relationship",
        "required": false
      },
      {
        "id": "core173",
        "type": "text",
        "label": "Emergency contact \u2014 phone",
        "required": true
      },
      {
        "id": "core174",
        "type": "section",
        "label": "Referral & Access"
      },
      {
        "id": "core175",
        "type": "dropdown",
        "label": "How did you hear about us?",
        "options": [
          "Google search",
          "Social media",
          "Friend or family referral",
          "Referring practitioner",
          "Other"
        ],
        "required": false
      },
      {
        "id": "core176",
        "type": "text",
        "label": "Referring practitioner (if any)",
        "required": false
      },
      {
        "id": "core177",
        "type": "text",
        "label": "GP name and clinic (if applicable)",
        "required": false
      },
      {
        "id": "core178",
        "type": "section",
        "label": "Consent"
      },
      {
        "id": "core179",
        "type": "choice",
        "label": "I consent to treatment",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "core180",
        "type": "choice",
        "label": "I consent to being contacted via SMS/email for appointment reminders",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "core181",
        "type": "choice",
        "label": "I acknowledge the privacy policy",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "core182",
        "type": "choice",
        "label": "I consent to photo/video (if relevant to this practice)",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": false
      },
      {
        "id": "core183",
        "type": "text",
        "label": "Signature (type full name)",
        "required": true
      },
      {
        "id": "core184",
        "type": "text",
        "label": "Date signed",
        "required": true
      },
      {
        "id": "ost1",
        "type": "section",
        "label": "Presenting Concern"
      },
      {
        "id": "ost2",
        "type": "bodymap",
        "label": "Location of pain or discomfort",
        "required": true
      },
      {
        "id": "ost3",
        "type": "text",
        "label": "Nature of the pain/discomfort",
        "required": false
      },
      {
        "id": "ost4",
        "type": "choice",
        "label": "Onset",
        "options": [
          "Sudden",
          "Gradual"
        ],
        "multi": false,
        "required": false
      },
      {
        "id": "ost5",
        "type": "text",
        "label": "Cause, if known",
        "required": false
      },
      {
        "id": "ost6",
        "type": "scale",
        "label": "Pain scale",
        "scaleStyle": "number",
        "min": 1,
        "max": 10,
        "minLabel": "No pain",
        "maxLabel": "Worst pain",
        "required": false
      },
      {
        "id": "ost7",
        "type": "choice",
        "label": "Pattern",
        "options": [
          "Constant",
          "Intermittent"
        ],
        "multi": false,
        "required": false
      },
      {
        "id": "ost8",
        "type": "text",
        "label": "What aggravates or relieves it?",
        "required": false
      },
      {
        "id": "ost9",
        "type": "section",
        "label": "Medical History"
      },
      {
        "id": "ost10",
        "type": "text",
        "label": "Past injuries, surgeries, fractures",
        "required": false
      },
      {
        "id": "ost11",
        "type": "text",
        "label": "Current medical conditions (especially cardiovascular, osteoporosis, cancer history)",
        "required": false
      },
      {
        "id": "ost12",
        "type": "choice",
        "label": "Currently taking blood thinners",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "ost13",
        "type": "text",
        "label": "Current medications",
        "required": false
      },
      {
        "id": "ost14",
        "type": "choice",
        "label": "Previous imaging (X-ray, MRI, CT) related to this concern",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": false
      },
      {
        "id": "ost15",
        "type": "section",
        "label": "Functional Assessment"
      },
      {
        "id": "ost16",
        "type": "text",
        "label": "Occupation and typical postures/movements",
        "required": false
      },
      {
        "id": "ost17",
        "type": "text",
        "label": "Exercise and activity levels",
        "required": false
      },
      {
        "id": "ost18",
        "type": "text",
        "label": "Sleep position and mattress type",
        "required": false
      },
      {
        "id": "ost19",
        "type": "text",
        "label": "Previous treatment for this issue (physio, chiro, osteo) and outcomes",
        "required": false
      },
      {
        "id": "ost20",
        "type": "section",
        "label": "Consent"
      },
      {
        "id": "ost21",
        "type": "choice",
        "label": "I consent to physical examination and hands-on manipulation",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "ost22",
        "type": "choice",
        "label": "I understand treatment may cause some post-treatment soreness",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      }
    ]
  },
  {
    "key": "nutritionist",
    "name": "Nutritionist",
    "serviceCategory": "nutrition",
    "fields": [
      {
        "id": "core185",
        "type": "section",
        "label": "Personal Information"
      },
      {
        "id": "core186",
        "type": "text",
        "label": "Full name",
        "required": true
      },
      {
        "id": "core187",
        "type": "text",
        "label": "Preferred name / pronouns",
        "required": false
      },
      {
        "id": "core188",
        "type": "text",
        "label": "Date of birth (DD/MM/YYYY)",
        "required": true
      },
      {
        "id": "core189",
        "type": "dropdown",
        "label": "Gender",
        "options": [
          "Female",
          "Male",
          "Non-binary",
          "Prefer to self-describe",
          "Prefer not to say"
        ],
        "required": false
      },
      {
        "id": "core190",
        "type": "text",
        "label": "Address",
        "required": false
      },
      {
        "id": "core191",
        "type": "text",
        "label": "Phone (mobile or home)",
        "required": true
      },
      {
        "id": "core192",
        "type": "text",
        "label": "Email",
        "required": true
      },
      {
        "id": "core193",
        "type": "text",
        "label": "Occupation",
        "required": false
      },
      {
        "id": "core194",
        "type": "text",
        "label": "Emergency contact \u2014 name",
        "required": true
      },
      {
        "id": "core195",
        "type": "text",
        "label": "Emergency contact \u2014 relationship",
        "required": false
      },
      {
        "id": "core196",
        "type": "text",
        "label": "Emergency contact \u2014 phone",
        "required": true
      },
      {
        "id": "core197",
        "type": "section",
        "label": "Referral & Access"
      },
      {
        "id": "core198",
        "type": "dropdown",
        "label": "How did you hear about us?",
        "options": [
          "Google search",
          "Social media",
          "Friend or family referral",
          "Referring practitioner",
          "Other"
        ],
        "required": false
      },
      {
        "id": "core199",
        "type": "text",
        "label": "Referring practitioner (if any)",
        "required": false
      },
      {
        "id": "core200",
        "type": "text",
        "label": "GP name and clinic (if applicable)",
        "required": false
      },
      {
        "id": "core201",
        "type": "section",
        "label": "Consent"
      },
      {
        "id": "core202",
        "type": "choice",
        "label": "I consent to treatment",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "core203",
        "type": "choice",
        "label": "I consent to being contacted via SMS/email for appointment reminders",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "core204",
        "type": "choice",
        "label": "I acknowledge the privacy policy",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "core205",
        "type": "choice",
        "label": "I consent to photo/video (if relevant to this practice)",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": false
      },
      {
        "id": "core206",
        "type": "text",
        "label": "Signature (type full name)",
        "required": true
      },
      {
        "id": "core207",
        "type": "text",
        "label": "Date signed",
        "required": true
      },
      {
        "id": "nut1",
        "type": "section",
        "label": "Presenting Concern"
      },
      {
        "id": "nut2",
        "type": "text",
        "label": "Primary goal (weight, energy, digestion, sports performance, condition management, etc.)",
        "required": true
      },
      {
        "id": "nut3",
        "type": "text",
        "label": "Duration of concern",
        "required": false
      },
      {
        "id": "nut4",
        "type": "section",
        "label": "Health History"
      },
      {
        "id": "nut5",
        "type": "text",
        "label": "Medical conditions (especially diabetes, cardiovascular disease, gut conditions)",
        "required": false
      },
      {
        "id": "nut6",
        "type": "text",
        "label": "Current medications and supplements",
        "required": false
      },
      {
        "id": "nut7",
        "type": "text",
        "label": "Food allergies and intolerances",
        "required": false
      },
      {
        "id": "nut8",
        "type": "text",
        "label": "Family history of relevant conditions (diabetes, heart disease, etc.)",
        "required": false
      },
      {
        "id": "nut9",
        "type": "section",
        "label": "Dietary Assessment"
      },
      {
        "id": "nut10",
        "type": "text",
        "label": "Typical day of eating (or 3-day food diary if available)",
        "required": true
      },
      {
        "id": "nut11",
        "type": "text",
        "label": "Meal timing and frequency",
        "required": false
      },
      {
        "id": "nut12",
        "type": "text",
        "label": "Fluid intake",
        "required": false
      },
      {
        "id": "nut13",
        "type": "text",
        "label": "Alcohol and caffeine intake",
        "required": false
      },
      {
        "id": "nut14",
        "type": "text",
        "label": "Food preferences, dislikes, cultural/religious dietary requirements",
        "required": false
      },
      {
        "id": "nut15",
        "type": "text",
        "label": "Cooking habits and time available for meal prep",
        "required": false
      },
      {
        "id": "nut16",
        "type": "text",
        "label": "Budget considerations",
        "required": false
      },
      {
        "id": "nut17",
        "type": "section",
        "label": "Lifestyle"
      },
      {
        "id": "nut18",
        "type": "text",
        "label": "Physical activity levels and type",
        "required": false
      },
      {
        "id": "nut19",
        "type": "dropdown",
        "label": "Sleep quality",
        "options": [
          "Excellent",
          "Good",
          "Fair",
          "Poor"
        ],
        "required": false
      },
      {
        "id": "nut20",
        "type": "scale",
        "label": "Stress levels",
        "scaleStyle": "number",
        "min": 1,
        "max": 10,
        "minLabel": "Low",
        "maxLabel": "High",
        "required": false
      },
      {
        "id": "nut21",
        "type": "text",
        "label": "Weight history (if relevant to goals)",
        "required": false
      },
      {
        "id": "nut22",
        "type": "section",
        "label": "Goals"
      },
      {
        "id": "nut23",
        "type": "text",
        "label": "Specific, measurable goals",
        "required": true
      },
      {
        "id": "nut24",
        "type": "text",
        "label": "Previous diet/nutrition attempts and outcomes",
        "required": false
      },
      {
        "id": "nut25",
        "type": "text",
        "label": "Support system for dietary change",
        "required": false
      }
    ]
  },
  {
    "key": "reflexologist",
    "name": "Reflexologist",
    "serviceCategory": "reflexology",
    "fields": [
      {
        "id": "core208",
        "type": "section",
        "label": "Personal Information"
      },
      {
        "id": "core209",
        "type": "text",
        "label": "Full name",
        "required": true
      },
      {
        "id": "core210",
        "type": "text",
        "label": "Preferred name / pronouns",
        "required": false
      },
      {
        "id": "core211",
        "type": "text",
        "label": "Date of birth (DD/MM/YYYY)",
        "required": true
      },
      {
        "id": "core212",
        "type": "dropdown",
        "label": "Gender",
        "options": [
          "Female",
          "Male",
          "Non-binary",
          "Prefer to self-describe",
          "Prefer not to say"
        ],
        "required": false
      },
      {
        "id": "core213",
        "type": "text",
        "label": "Address",
        "required": false
      },
      {
        "id": "core214",
        "type": "text",
        "label": "Phone (mobile or home)",
        "required": true
      },
      {
        "id": "core215",
        "type": "text",
        "label": "Email",
        "required": true
      },
      {
        "id": "core216",
        "type": "text",
        "label": "Occupation",
        "required": false
      },
      {
        "id": "core217",
        "type": "text",
        "label": "Emergency contact \u2014 name",
        "required": true
      },
      {
        "id": "core218",
        "type": "text",
        "label": "Emergency contact \u2014 relationship",
        "required": false
      },
      {
        "id": "core219",
        "type": "text",
        "label": "Emergency contact \u2014 phone",
        "required": true
      },
      {
        "id": "core220",
        "type": "section",
        "label": "Referral & Access"
      },
      {
        "id": "core221",
        "type": "dropdown",
        "label": "How did you hear about us?",
        "options": [
          "Google search",
          "Social media",
          "Friend or family referral",
          "Referring practitioner",
          "Other"
        ],
        "required": false
      },
      {
        "id": "core222",
        "type": "text",
        "label": "Referring practitioner (if any)",
        "required": false
      },
      {
        "id": "core223",
        "type": "text",
        "label": "GP name and clinic (if applicable)",
        "required": false
      },
      {
        "id": "core224",
        "type": "section",
        "label": "Consent"
      },
      {
        "id": "core225",
        "type": "choice",
        "label": "I consent to treatment",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "core226",
        "type": "choice",
        "label": "I consent to being contacted via SMS/email for appointment reminders",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "core227",
        "type": "choice",
        "label": "I acknowledge the privacy policy",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "core228",
        "type": "choice",
        "label": "I consent to photo/video (if relevant to this practice)",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": false
      },
      {
        "id": "core229",
        "type": "text",
        "label": "Signature (type full name)",
        "required": true
      },
      {
        "id": "core230",
        "type": "text",
        "label": "Date signed",
        "required": true
      },
      {
        "id": "rfx1",
        "type": "section",
        "label": "Presenting Concern"
      },
      {
        "id": "rfx2",
        "type": "text",
        "label": "What are you hoping to address (relaxation, specific symptom, general wellbeing)?",
        "required": true
      },
      {
        "id": "rfx3",
        "type": "text",
        "label": "Current areas of tension or discomfort",
        "required": false
      },
      {
        "id": "rfx4",
        "type": "section",
        "label": "Health Background"
      },
      {
        "id": "rfx5",
        "type": "text",
        "label": "Current medical conditions (particularly diabetes, circulatory issues, neuropathy)",
        "required": false
      },
      {
        "id": "rfx6",
        "type": "choice",
        "label": "Currently pregnant (first trimester requires caution)",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": false
      },
      {
        "id": "rfx7",
        "type": "text",
        "label": "Foot/lower leg conditions: fungal infections, open wounds, varicose veins, recent fractures",
        "required": false
      },
      {
        "id": "rfx8",
        "type": "text",
        "label": "Current medications",
        "required": false
      },
      {
        "id": "rfx9",
        "type": "choice",
        "label": "Blood clotting disorder or use of blood thinners",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "rfx10",
        "type": "section",
        "label": "Reflexology-Specific"
      },
      {
        "id": "rfx11",
        "type": "choice",
        "label": "Previous reflexology experience",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": false
      },
      {
        "id": "rfx12",
        "type": "choice",
        "label": "Pressure preference",
        "options": [
          "Light",
          "Firm"
        ],
        "multi": false,
        "required": false
      },
      {
        "id": "rfx13",
        "type": "choice",
        "label": "Are your feet ticklish or especially sensitive?",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": false
      },
      {
        "id": "rfx14",
        "type": "choice",
        "label": "Prefer hand reflexology instead of feet",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": false
      },
      {
        "id": "rfx15",
        "type": "text",
        "label": "Intentions or focus areas",
        "required": false
      }
    ]
  },
  {
    "key": "acupuncturist",
    "name": "Acupuncturist",
    "serviceCategory": "acupuncture",
    "fields": [
      {
        "id": "core231",
        "type": "section",
        "label": "Personal Information"
      },
      {
        "id": "core232",
        "type": "text",
        "label": "Full name",
        "required": true
      },
      {
        "id": "core233",
        "type": "text",
        "label": "Preferred name / pronouns",
        "required": false
      },
      {
        "id": "core234",
        "type": "text",
        "label": "Date of birth (DD/MM/YYYY)",
        "required": true
      },
      {
        "id": "core235",
        "type": "dropdown",
        "label": "Gender",
        "options": [
          "Female",
          "Male",
          "Non-binary",
          "Prefer to self-describe",
          "Prefer not to say"
        ],
        "required": false
      },
      {
        "id": "core236",
        "type": "text",
        "label": "Address",
        "required": false
      },
      {
        "id": "core237",
        "type": "text",
        "label": "Phone (mobile or home)",
        "required": true
      },
      {
        "id": "core238",
        "type": "text",
        "label": "Email",
        "required": true
      },
      {
        "id": "core239",
        "type": "text",
        "label": "Occupation",
        "required": false
      },
      {
        "id": "core240",
        "type": "text",
        "label": "Emergency contact \u2014 name",
        "required": true
      },
      {
        "id": "core241",
        "type": "text",
        "label": "Emergency contact \u2014 relationship",
        "required": false
      },
      {
        "id": "core242",
        "type": "text",
        "label": "Emergency contact \u2014 phone",
        "required": true
      },
      {
        "id": "core243",
        "type": "section",
        "label": "Referral & Access"
      },
      {
        "id": "core244",
        "type": "dropdown",
        "label": "How did you hear about us?",
        "options": [
          "Google search",
          "Social media",
          "Friend or family referral",
          "Referring practitioner",
          "Other"
        ],
        "required": false
      },
      {
        "id": "core245",
        "type": "text",
        "label": "Referring practitioner (if any)",
        "required": false
      },
      {
        "id": "core246",
        "type": "text",
        "label": "GP name and clinic (if applicable)",
        "required": false
      },
      {
        "id": "core247",
        "type": "section",
        "label": "Consent"
      },
      {
        "id": "core248",
        "type": "choice",
        "label": "I consent to treatment",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "core249",
        "type": "choice",
        "label": "I consent to being contacted via SMS/email for appointment reminders",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "core250",
        "type": "choice",
        "label": "I acknowledge the privacy policy",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "core251",
        "type": "choice",
        "label": "I consent to photo/video (if relevant to this practice)",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": false
      },
      {
        "id": "core252",
        "type": "text",
        "label": "Signature (type full name)",
        "required": true
      },
      {
        "id": "core253",
        "type": "text",
        "label": "Date signed",
        "required": true
      },
      {
        "id": "acu1",
        "type": "section",
        "label": "Presenting Concern"
      },
      {
        "id": "acu2",
        "type": "text",
        "label": "Main complaint and duration",
        "required": true
      },
      {
        "id": "acu3",
        "type": "scale",
        "label": "Pain scale (if pain-related)",
        "scaleStyle": "number",
        "min": 1,
        "max": 10,
        "minLabel": "No pain",
        "maxLabel": "Worst pain",
        "required": false
      },
      {
        "id": "acu4",
        "type": "text",
        "label": "Quality of pain (sharp, dull, burning, etc.)",
        "required": false
      },
      {
        "id": "acu5",
        "type": "text",
        "label": "Aggravating/relieving factors",
        "required": false
      },
      {
        "id": "acu6",
        "type": "section",
        "label": "Systems Review"
      },
      {
        "id": "acu7",
        "type": "dropdown",
        "label": "Sleep patterns",
        "options": [
          "Good",
          "Fair",
          "Poor"
        ],
        "required": false
      },
      {
        "id": "acu8",
        "type": "text",
        "label": "Digestion and appetite",
        "required": false
      },
      {
        "id": "acu9",
        "type": "text",
        "label": "Bowel and bladder habits",
        "required": false
      },
      {
        "id": "acu10",
        "type": "text",
        "label": "Menstrual/reproductive health (if applicable)",
        "required": false
      },
      {
        "id": "acu11",
        "type": "scale",
        "label": "Energy levels throughout the day",
        "scaleStyle": "number",
        "min": 1,
        "max": 10,
        "minLabel": "Low",
        "maxLabel": "High",
        "required": false
      },
      {
        "id": "acu12",
        "type": "choice",
        "label": "Temperature sensitivity",
        "options": [
          "Tend to feel hot",
          "Tend to feel cold",
          "Neither"
        ],
        "multi": false,
        "required": false
      },
      {
        "id": "acu13",
        "type": "text",
        "label": "Emotional state and stress levels",
        "required": false
      },
      {
        "id": "acu14",
        "type": "section",
        "label": "Medical History"
      },
      {
        "id": "acu15",
        "type": "text",
        "label": "Current medications and supplements",
        "required": false
      },
      {
        "id": "acu16",
        "type": "choice",
        "label": "Bleeding disorder or blood thinner use",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "acu17",
        "type": "choice",
        "label": "Pacemaker (relevant if electro-acupuncture is used)",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "acu18",
        "type": "choice",
        "label": "Currently pregnant (certain points are contraindicated)",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "acu19",
        "type": "text",
        "label": "Allergies (including to metals, if relevant)",
        "required": false
      },
      {
        "id": "acu20",
        "type": "choice",
        "label": "Fear of needles or previous adverse reaction to acupuncture",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": false
      },
      {
        "id": "acu21",
        "type": "section",
        "label": "Consent"
      },
      {
        "id": "acu22",
        "type": "choice",
        "label": "I consent to needling",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "acu23",
        "type": "choice",
        "label": "I understand minor bruising/bleeding at insertion sites is possible",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      }
    ]
  },
  {
    "key": "chiropractor",
    "name": "Chiropractor",
    "serviceCategory": "chiropractic",
    "fields": [
      {
        "id": "core254",
        "type": "section",
        "label": "Personal Information"
      },
      {
        "id": "core255",
        "type": "text",
        "label": "Full name",
        "required": true
      },
      {
        "id": "core256",
        "type": "text",
        "label": "Preferred name / pronouns",
        "required": false
      },
      {
        "id": "core257",
        "type": "text",
        "label": "Date of birth (DD/MM/YYYY)",
        "required": true
      },
      {
        "id": "core258",
        "type": "dropdown",
        "label": "Gender",
        "options": [
          "Female",
          "Male",
          "Non-binary",
          "Prefer to self-describe",
          "Prefer not to say"
        ],
        "required": false
      },
      {
        "id": "core259",
        "type": "text",
        "label": "Address",
        "required": false
      },
      {
        "id": "core260",
        "type": "text",
        "label": "Phone (mobile or home)",
        "required": true
      },
      {
        "id": "core261",
        "type": "text",
        "label": "Email",
        "required": true
      },
      {
        "id": "core262",
        "type": "text",
        "label": "Occupation",
        "required": false
      },
      {
        "id": "core263",
        "type": "text",
        "label": "Emergency contact \u2014 name",
        "required": true
      },
      {
        "id": "core264",
        "type": "text",
        "label": "Emergency contact \u2014 relationship",
        "required": false
      },
      {
        "id": "core265",
        "type": "text",
        "label": "Emergency contact \u2014 phone",
        "required": true
      },
      {
        "id": "core266",
        "type": "section",
        "label": "Referral & Access"
      },
      {
        "id": "core267",
        "type": "dropdown",
        "label": "How did you hear about us?",
        "options": [
          "Google search",
          "Social media",
          "Friend or family referral",
          "Referring practitioner",
          "Other"
        ],
        "required": false
      },
      {
        "id": "core268",
        "type": "text",
        "label": "Referring practitioner (if any)",
        "required": false
      },
      {
        "id": "core269",
        "type": "text",
        "label": "GP name and clinic (if applicable)",
        "required": false
      },
      {
        "id": "core270",
        "type": "section",
        "label": "Consent"
      },
      {
        "id": "core271",
        "type": "choice",
        "label": "I consent to treatment",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "core272",
        "type": "choice",
        "label": "I consent to being contacted via SMS/email for appointment reminders",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "core273",
        "type": "choice",
        "label": "I acknowledge the privacy policy",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "core274",
        "type": "choice",
        "label": "I consent to photo/video (if relevant to this practice)",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": false
      },
      {
        "id": "core275",
        "type": "text",
        "label": "Signature (type full name)",
        "required": true
      },
      {
        "id": "core276",
        "type": "text",
        "label": "Date signed",
        "required": true
      },
      {
        "id": "chi1",
        "type": "section",
        "label": "Presenting Concern"
      },
      {
        "id": "chi2",
        "type": "bodymap",
        "label": "Location of complaint",
        "required": true
      },
      {
        "id": "chi3",
        "type": "text",
        "label": "Nature and severity of complaint",
        "required": false
      },
      {
        "id": "chi4",
        "type": "text",
        "label": "Onset and mechanism of injury (if applicable)",
        "required": false
      },
      {
        "id": "chi5",
        "type": "choice",
        "label": "Pattern",
        "options": [
          "Constant",
          "Intermittent",
          "Worse at certain times"
        ],
        "multi": false,
        "required": false
      },
      {
        "id": "chi6",
        "type": "text",
        "label": "Radiating symptoms (numbness, tingling, weakness)",
        "required": false
      },
      {
        "id": "chi7",
        "type": "section",
        "label": "Medical History"
      },
      {
        "id": "chi8",
        "type": "text",
        "label": "Past spinal or joint injuries, surgeries",
        "required": false
      },
      {
        "id": "chi9",
        "type": "text",
        "label": "Diagnosed conditions (osteoporosis, arthritis, cancer, cardiovascular disease)",
        "required": false
      },
      {
        "id": "chi10",
        "type": "choice",
        "label": "Currently taking blood thinners or corticosteroids",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "chi11",
        "type": "text",
        "label": "Previous imaging (X-ray, MRI, CT) and reports if available",
        "required": false
      },
      {
        "id": "chi12",
        "type": "paragraph",
        "text": "The following questions help your practitioner screen for issues that need urgent medical attention rather than chiropractic care."
      },
      {
        "id": "chi13",
        "type": "choice",
        "label": "Any unexplained weight loss recently?",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "chi14",
        "type": "choice",
        "label": "Pain that wakes you at night or is worse at night?",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "chi15",
        "type": "choice",
        "label": "Any changes in bladder or bowel control?",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "chi16",
        "type": "choice",
        "label": "Any numbness in the saddle/groin area?",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "chi17",
        "type": "section",
        "label": "Functional/Lifestyle"
      },
      {
        "id": "chi18",
        "type": "text",
        "label": "Occupation and ergonomic factors",
        "required": false
      },
      {
        "id": "chi19",
        "type": "text",
        "label": "Exercise and activity levels",
        "required": false
      },
      {
        "id": "chi20",
        "type": "text",
        "label": "Previous chiropractic, physio, or osteo treatment and outcomes",
        "required": false
      },
      {
        "id": "chi21",
        "type": "text",
        "label": "Sleep position and mattress/pillow setup",
        "required": false
      },
      {
        "id": "chi22",
        "type": "section",
        "label": "Consent"
      },
      {
        "id": "chi23",
        "type": "choice",
        "label": "I consent to physical examination and spinal/joint adjustment",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "chi24",
        "type": "choice",
        "label": "I have had the adjustment technique explained and understand the risks",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      },
      {
        "id": "chi25",
        "type": "choice",
        "label": "I understand treatment may cause some post-adjustment soreness",
        "options": [
          "Yes",
          "No"
        ],
        "multi": false,
        "required": true
      }
    ]
  }
];
