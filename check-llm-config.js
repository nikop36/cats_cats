#!/usr/bin/env node

console.log('\n🐱 Cats Feed - LLM Integration Status\n');
console.log('=' .repeat(50));

const providers = [
  { name: 'Groq (Llama 3)', env: 'GROQ_API_KEY', recommended: true },
  { name: 'Hugging Face', env: 'HUGGINGFACE_API_KEY', recommended: false },
  { name: 'OpenAI', env: 'OPENAI_API_KEY', recommended: false },
];

let hasAnyKey = false;

providers.forEach(({ name, env, recommended }) => {
  const hasKey = !!process.env[env];
  hasAnyKey = hasAnyKey || hasKey;
  
  const status = hasKey ? '✅ Configured' : '⚠️  Not configured';
  const rec = recommended ? ' (Recommended)' : '';
  
  console.log(`${status}  ${name}${rec}`);
  
  if (hasKey && env === 'GROQ_API_KEY') {
    console.log(`   → Fast inference with Llama models`);
  } else if (hasKey && env === 'OPENAI_API_KEY') {
    console.log(`   → High-quality responses (paid)`);
  } else if (hasKey && env === 'HUGGINGFACE_API_KEY') {
    console.log(`   → Multiple model options`);
  }
});

console.log('=' .repeat(50));

if (!hasAnyKey) {
  console.log('\n📝 No LLM API keys detected.');
  console.log('   The app will use MOCK DATA with realistic cat activities.');
  console.log('\n   To use real LLM providers:');
  console.log('   1. Copy .env.local.example to .env.local');
  console.log('   2. Add at least one API key');
  console.log('   3. Restart the dev server\n');
  console.log('   Get free API key at: https://console.groq.com\n');
} else {
  console.log('\n✨ LLM integration ready!\n');
}

console.log('Start the app:');
console.log('  Terminal 1: npm run start:server');
console.log('  Terminal 2: npm run dev');
console.log('  Browser:    http://localhost:3001\n');
