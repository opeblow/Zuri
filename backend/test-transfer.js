import 'dotenv/config';
import { singleTransfer, verifyBankAccount } from './src/services/monnify.js';

async function main() {
  try {
    // Destination: 2127502965 | Sterling Bank (232)
    // Source: 4009843125 | Wema Bank (035)

    console.log('1. Verifying destination account: 2127502965 (Sterling Bank)');
    const verification = await verifyBankAccount({
      accountNumber: '2127502965',
      bankCode: '232' // Sterling Bank
    });
    console.log('Resolved Account:', verification);

    console.log('\n2. Initiating transfer of 15,000 NGN...');
    const result = await singleTransfer({
      amount: 1500000, // 15k NGN in kobo
      reference: `TEST-TX-${Date.now()}`,
      narration: 'Test Transfer to Sterling',
      destinationBankCode: '232',
      destinationAccountNumber: '2127502965',
      destinationAccountName: verification.accountName,
    });
    console.log('\nTransfer Result:', result);

  } catch (error) {
    console.error('\nError:', error.message);
  }
}

main();
