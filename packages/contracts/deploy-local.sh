#!/bin/bash

# Start Anvil in the background if not already running
if ! nc -z localhost 8545; then
  echo "Starting Anvil..."
  anvil > /dev/null 2>&1 &
  ANVIL_PID=$!
  echo "Waiting for Anvil to start..."
  while ! nc -z localhost 8545; do   
    sleep 0.5
  done
  echo "Anvil is ready."
else
  echo "Anvil is already running."
fi

# Deploy contracts and capture output specifically
echo "Deploying contracts..."
DEPLOY_OUT=$(forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --non-interactive)
echo "$DEPLOY_OUT"

# Extract addresses using grep and awk
REGISTRY=$(echo "$DEPLOY_OUT" | grep "CallRegistry deployed at:" | awk '{print $NF}')
OUTCOME=$(echo "$DEPLOY_OUT" | grep "OutcomeManager deployed at:" | awk '{print $NF}')
PAYMASTER=$(echo "$DEPLOY_OUT" | grep "Paymaster deployed at:" | awk '{print $NF}')
MOCK_TOKEN=$(echo "$DEPLOY_OUT" | grep "MockToken deployed at:" | awk '{print $NF}')

if [ -z "$REGISTRY" ] || [ -z "$MOCK_TOKEN" ]; then
  echo "ERROR: Failed to capture deployment addresses. Check the output above."
  exit 1
fi

echo "Captured Addresses:"
echo "Registry: $REGISTRY"
echo "Outcome: $OUTCOME"
echo "Paymaster: $PAYMASTER"
echo "Token: $MOCK_TOKEN"

# Update Backend .env
BACKEND_ENV="../backend/.env"
if [ -f "$BACKEND_ENV" ]; then
  echo "Updating $BACKEND_ENV..."
  sed -i '' "s/CALL_REGISTRY_ADDRESS=.*/CALL_REGISTRY_ADDRESS=$REGISTRY/" "$BACKEND_ENV"
  sed -i '' "s/OUTCOME_MANAGER_ADDRESS=.*/OUTCOME_MANAGER_ADDRESS=$OUTCOME/" "$BACKEND_ENV"
  sed -i '' "s/MOCK_TOKEN_ADDRESS=.*/MOCK_TOKEN_ADDRESS=$MOCK_TOKEN/" "$BACKEND_ENV"
fi

# Update Frontend .env.local
FRONTEND_ENV="../frontend/.env.local"
if [ -f "$FRONTEND_ENV" ]; then
  echo "Updating $FRONTEND_ENV..."
  sed -i '' "s/NEXT_PUBLIC_CALL_REGISTRY_ADDRESS=.*/NEXT_PUBLIC_CALL_REGISTRY_ADDRESS=$REGISTRY/" "$FRONTEND_ENV"
  sed -i '' "s/NEXT_PUBLIC_OUTCOME_MANAGER_ADDRESS=.*/NEXT_PUBLIC_OUTCOME_MANAGER_ADDRESS=$OUTCOME/" "$FRONTEND_ENV"
  sed -i '' "s/NEXT_PUBLIC_PAYMASTER_ADDRESS=.*/NEXT_PUBLIC_PAYMASTER_ADDRESS=$PAYMASTER/" "$FRONTEND_ENV"
  sed -i '' "s/NEXT_PUBLIC_MOCK_TOKEN_ADDRESS=.*/NEXT_PUBLIC_MOCK_TOKEN_ADDRESS=$MOCK_TOKEN/" "$FRONTEND_ENV"
fi

# Mint tokens to the first Anvil test account
echo "Minting 1,000,000 mUSDC to test account..."
cast send "$MOCK_TOKEN" "mint(address,uint256)" 0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266 1000000000000000000000000 --rpc-url http://127.0.0.1:8545 --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

echo "Local environment setup complete."

# If we started anvil in this script, wait for it
if [ -n "$ANVIL_PID" ]; then
  wait $ANVIL_PID
fi
