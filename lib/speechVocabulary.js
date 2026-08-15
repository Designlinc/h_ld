// lib/speechVocabulary.js — custom vocabulary for speech-to-text
// cleanup, organized by practitioner category (matching the same keys used
// in form-templates.js). Fed into the Groq cleanup prompt as context so
// discipline-specific terms get corrected toward the right spelling
// instead of being guessed at phonetically by a general-purpose model —
// same technique FreeFlow itself uses for names/jargon.
//
// Priority build order per Lincoln: Kinesiology, Naturopathy, Homeopathy,
// Psychology first (fullest lists below), the rest lighter but still real.
// Note: "homeopath" is not currently one of the twelve intake form
// categories in form-templates.js — built anyway per request, but there's
// no matching intake template for it yet if that's ever wanted.

// ── Shared anatomy — used across nearly every practitioner type ──
const VOCAB_ANATOMY = [
  // Skeletal
  'cranium','mandible','maxilla','zygomatic','clavicle','scapula','sternum','manubrium','xiphoid process',
  'humerus','radius','ulna','carpals','metacarpals','phalanges','pelvis','ilium','ischium','pubis',
  'sacrum','coccyx','femur','patella','tibia','fibula','tarsals','metatarsals','calcaneus','talus',
  'vertebrae','cervical spine','thoracic spine','lumbar spine','C1','C2','C7','T1','T12','L1','L5',
  'atlas','axis','intervertebral disc','foramen','acromion','olecranon','greater trochanter','malleolus',
  // Joints
  'glenohumeral joint','acromioclavicular joint','sacroiliac joint','SI joint','temporomandibular joint','TMJ',
  'costovertebral joint','symphysis pubis','tibiofemoral joint','subtalar joint',
  // Major muscles
  'sternocleidomastoid','trapezius','levator scapulae','rhomboids','latissimus dorsi','deltoid',
  'rotator cuff','supraspinatus','infraspinatus','teres minor','subscapularis','biceps brachii',
  'triceps brachii','pectoralis major','pectoralis minor','serratus anterior','rectus abdominis',
  'transverse abdominis','internal oblique','external oblique','erector spinae','quadratus lumborum',
  'psoas major','iliacus','iliopsoas','gluteus maximus','gluteus medius','gluteus minimus','piriformis',
  'quadriceps','vastus lateralis','vastus medialis','rectus femoris','hamstrings','biceps femoris',
  'semitendinosus','semimembranosus','gastrocnemius','soleus','tibialis anterior','peroneus longus',
  'adductor longus','adductor magnus','gracilis','sartorius','tensor fasciae latae','IT band','iliotibial band',
  'diaphragm','intercostals','pelvic floor','multifidus',
  // Organs & systems
  'oesophagus','esophagus','duodenum','jejunum','ileum','pancreas','gallbladder','adrenal glands',
  'thyroid','parathyroid','pituitary gland','pineal gland','hypothalamus','lymphatic system','lymph nodes',
  'spleen','thymus','bronchi','alveoli','nephron','ureter','bladder sphincter','endocrine system',
  'reproductive system','ovaries','uterus','fallopian tubes','testes','prostate',
];

const VOCAB_NEUROLOGICAL = [
  'central nervous system','peripheral nervous system','autonomic nervous system',
  'sympathetic nervous system','parasympathetic nervous system','vagus nerve','vagal tone',
  'sciatic nerve','brachial plexus','cervical plexus','lumbar plexus','trigeminal nerve',
  'cranial nerves','spinal cord','dermatome','myotome','proprioception','interoception',
  'cerebellum','cerebrum','brainstem','amygdala','hippocampus','prefrontal cortex','limbic system',
  'basal ganglia','corpus callosum','neurotransmitter','dopamine','serotonin','GABA','cortisol',
  'adrenaline','epinephrine','noradrenaline','norepinephrine','oxytocin','fight or flight',
  'polyvagal theory','neuroplasticity','somatic nervous system','reflex arc','nociceptor',
];

// ── Shared energy systems — chakras, meridians, subtle-body terms used
// across kinesiology, energy work, reiki, acupuncture and related practice ──
const VOCAB_ENERGY_SYSTEMS = [
  // Chakras
  'chakra','root chakra','muladhara','sacral chakra','svadhisthana','solar plexus chakra','manipura',
  'heart chakra','anahata','throat chakra','vishuddha','third eye chakra','ajna','crown chakra','sahasrara',
  'chakra balancing','chakra alignment','energy centre','energy center','aura','auric field',
  'kundalini','prana','pranic energy','subtle body','etheric body',
  // Meridians (TCM) — twelve primary plus the two key extraordinary vessels
  'meridian','meridian pathway','qi','chi','lung meridian','large intestine meridian','stomach meridian',
  'spleen meridian','heart meridian','small intestine meridian','bladder meridian','kidney meridian',
  'pericardium meridian','triple burner meridian','san jiao','gallbladder meridian','liver meridian',
  'governing vessel','du mai','conception vessel','ren mai','acupoint','acupressure point',
  'yin','yang','five elements','wood element','fire element','earth element','metal element','water element',
  'zang fu','qi deficiency','qi stagnation','blood stagnation','damp heat',
];

export const SPEECH_VOCABULARY = {

  // ═══ PRIORITY 1 ═══
  kinesiologist: [
    ...VOCAB_ANATOMY, ...VOCAB_NEUROLOGICAL, ...VOCAB_ENERGY_SYSTEMS,
    'muscle testing','manual muscle testing','MMT','muscle monitoring','indicator muscle',
    'applied kinesiology','specialised kinesiology','clear circuit','switching','neurological disorganisation',
    'therapy localisation','challenge testing','surrogate testing','pre-check','clearing statement',
    'priority correction','emotional stress release','neurolymphatic reflex points','neurovascular holding points',
    'origin and insertion','spindle cell technique','golgi tendon reflex','cross crawl','gait reflex',
    'cloacal reflex','ileocecal valve','hyoid','temporal tap','frontal eminence points','stress release points',
    'meridian tracing','five element balance','emotional freedom technique','EFT tapping','bach flower remedies',
    'kinesiology balance','goal balance','pre-goal statement','age recession','timeline technique',
    'psycho-emotional stress','blocked energy','energy blockage','integration','over-energy','under-energy',
  ],

  naturopath: [
    ...VOCAB_ANATOMY,
    'naturopathy','naturopathic','vitalism','vis medicatrix naturae','tolle causam','treat the root cause',
    'gut microbiome','dysbiosis','leaky gut','intestinal permeability','SIBO','candida overgrowth',
    'elimination diet','food intolerance','food sensitivity','FODMAP','histamine intolerance',
    'adrenal fatigue','HPA axis','hypothalamic-pituitary-adrenal axis','methylation','MTHFR',
    'detoxification','liver detoxification','phase one liver detox','phase two liver detox',
    'antioxidant','free radical','oxidative stress','inflammation','anti-inflammatory',
    'probiotic','prebiotic','digestive enzymes','betaine hydrochloride','bitters',
    // Herbs & supplements
    'ashwagandha','rhodiola','turmeric','curcumin','echinacea','St John\u2019s wort','milk thistle',
    'valerian root','passionflower','chamomile','ginger','peppermint oil','licorice root','slippery elm',
    'magnesium glycinate','zinc citrate','vitamin D3','vitamin B12','methylcobalamin','folate','omega-3',
    'fish oil','iron bisglycinate','coenzyme Q10','CoQ10','N-acetylcysteine','NAC','5-HTP',
    'adaptogen','nervine','tonic herb','tincture','decoction','materia medica',
    'iridology','naturopathic assessment','case history','nutritional assessment',
  ],

  // Not currently one of the twelve intake templates in form-templates.js
  homeopath: [
    'homeopathy','homeopathic','homeopathic remedy','materia medica','repertory','repertorisation',
    'similimum','law of similars','like cures like','potency','potentisation','centesimal potency',
    'decimal potency','30C','200C','1M','LM potency','succussion','dilution','proving','symptom picture',
    'constitutional remedy','miasm','miasmatic','vital force','aggravation','healing crisis',
    // Common remedies
    'arnica montana','belladonna','nux vomica','bryonia','pulsatilla','sulphur','lycopodium',
    'phosphorus','natrum muriaticum','sepia','ignatia','rhus toxicodendron','apis mellifica',
    'chamomilla','gelsemium','arsenicum album','calcarea carbonica','silica','carbo vegetabilis',
    'hypericum','ledum','cantharis','euphrasia','ruta graveolens','staphysagria','thuja',
  ],

  psychologist: [
    ...VOCAB_NEUROLOGICAL,
    'cognitive behavioural therapy','CBT','dialectical behaviour therapy','DBT',
    'acceptance and commitment therapy','ACT','eye movement desensitisation and reprocessing','EMDR',
    'psychodynamic therapy','schema therapy','narrative therapy','solution-focused therapy',
    'mindfulness-based cognitive therapy','exposure therapy','cognitive restructuring',
    'automatic negative thoughts','cognitive distortion','catastrophising','rumination',
    'generalised anxiety disorder','GAD','major depressive disorder','MDD','panic disorder',
    'obsessive compulsive disorder','OCD','post-traumatic stress disorder','PTSD','complex trauma',
    'attention deficit hyperactivity disorder','ADHD','autism spectrum disorder','ASD',
    'borderline personality disorder','BPD','bipolar disorder','dissociation','dissociative episode',
    'attachment style','secure attachment','anxious attachment','avoidant attachment',
    'window of tolerance','emotional regulation','distress tolerance','psychoeducation',
    'therapeutic alliance','presenting problem','risk assessment','suicidal ideation','self-harm',
    'formulation','DSM-5','case conceptualisation','treatment plan','safety plan',
  ],

  // ═══ Remaining categories — lighter but genuinely useful ═══
  reiki: [
    ...VOCAB_ENERGY_SYSTEMS,
    'reiki','usui reiki','reiki attunement','reiki symbol','hands-on healing','distance healing',
    'energy healing','energy flow','life force energy','byosen','reiki share','reiki master',
    'grounding','scanning the aura','releasing blocked energy',
  ],

  counsellor: [
    'active listening','person-centred therapy','unconditional positive regard','congruence',
    'reflective listening','open-ended question','therapeutic rapport','presenting issue',
    'grief counselling','relationship counselling','family systems','boundary setting',
    'coping strategies','psychoeducation','confidentiality','duty of care','mandatory reporting',
  ],

  'energy-worker': [
    ...VOCAB_ENERGY_SYSTEMS,
    'energy work','energy healing','biofield','subtle energy','energetic blockage',
    'grounding technique','clearing','protection technique','intuitive healing',
  ],

  therapist: [
    ...VOCAB_ANATOMY, ...VOCAB_NEUROLOGICAL,
    'manual therapy','soft tissue release','myofascial release','trigger point','trigger point therapy',
    'range of motion','ROM','deep tissue massage','remedial massage','sports massage','lymphatic drainage',
    'proprioceptive neuromuscular facilitation','PNF stretching','contraindication','postural assessment',
  ],

  osteopath: [
    ...VOCAB_ANATOMY, ...VOCAB_NEUROLOGICAL,
    'osteopathy','osteopathic manipulative treatment','somatic dysfunction','fascia','fascial restriction',
    'high velocity low amplitude','HVLA','muscle energy technique','MET','strain counterstrain',
    'craniosacral therapy','cranial rhythm','visceral manipulation','joint mobilisation','joint manipulation',
    'palpation','biomechanics','postural analysis',
  ],

  nutritionist: [
    'macronutrient','micronutrient','basal metabolic rate','BMR','glycaemic index','glycaemic load',
    'insulin resistance','food diary','dietary recall','meal plan','nutrient deficiency',
    'iron deficiency anaemia','B12 deficiency','vitamin D deficiency','electrolyte balance',
    'anti-inflammatory diet','elimination diet','food allergy','food intolerance','FODMAP',
  ],

  reflexologist: [
    'reflexology','reflex point','reflex map','zone therapy','foot reflexology','hand reflexology',
    'pressure point','solar plexus point','lymphatic reflex','pituitary reflex point',
  ],

  acupuncturist: [
    ...VOCAB_ENERGY_SYSTEMS,
    'acupuncture','dry needling','moxibustion','cupping therapy','gua sha','auricular acupuncture',
    'electroacupuncture','needle retention','de qi sensation','tongue diagnosis','pulse diagnosis',
    'TCM diagnosis','pattern differentiation','excess pattern','deficiency pattern',
  ],

  chiropractor: [
    ...VOCAB_ANATOMY, ...VOCAB_NEUROLOGICAL,
    'chiropractic adjustment','spinal manipulation','subluxation','vertebral subluxation complex',
    'spinal alignment','disc herniation','disc bulge','sciatica','radiculopathy','nerve impingement',
    'diversified technique','activator technique','Gonstead technique','drop table technique',
    'postural correction','spinal curvature','scoliosis','lordosis','kyphosis',
  ],
};
