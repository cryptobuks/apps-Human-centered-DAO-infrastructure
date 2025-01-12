// Library utils / Ethers for now
import {BigNumberish, constants, ethers} from 'ethers';
import {TFunction} from 'react-i18next';
import {ApolloClient} from '@apollo/client';
import {Client} from '@aragon/sdk-client';

import {fetchTokenData} from 'services/prices';
import {SupportedNetworks} from 'utils/constants';

import {ActionWithdraw} from 'utils/types';

export function formatUnits(amount: BigNumberish, decimals: number) {
  if (amount.toString().includes('.') || !decimals) {
    return amount.toString();
  }
  return ethers.utils.formatUnits(amount, decimals);
}

// (Temporary) Should be moved to ui-component perhaps
/**
 * Handles copying and pasting to and from the clipboard respectively
 * @param currentValue field value
 * @param onChange on value change callback
 */
export async function handleClipboardActions(
  currentValue: string,
  onChange: (value: string) => void
) {
  if (currentValue) {
    await navigator.clipboard.writeText(currentValue);

    // TODO: change to proper mechanism
    alert('Copied');
  } else {
    const textFromClipboard = await navigator.clipboard.readText();
    onChange(textFromClipboard);
  }
}

/**
 * Check if the given value is an empty string
 * @param value parameter
 * @returns whether the parameter is an empty string
 */
export const isOnlyWhitespace = (value: string) => {
  return value.trim() === '';
};

/**
 * Return user friendly wallet address label if available
 * @param value address
 * @param t translation function
 * @returns user friendly label or wallet address
 */
export const getUserFriendlyWalletLabel = (
  value: string,
  t: TFunction<'translation', undefined>
) => {
  switch (value) {
    case '':
      return '';
    case constants.AddressZero:
      return t('labels.daoTreasury');

    default:
      return value;
  }
};

export const toHex = (num: number | string) => {
  return '0x' + num.toString(16);
};

/**
 * DecodeWithdrawToAction
 * @param data Uint8Array action data
 * @param client SDK client, Fetched using useClient
 * @param apolloClient Apollo client, Fetched using useApolloClient
 * @param network network of the dao
 * @returns Return Decoded Withdraw action
 */
export async function decodeWithdrawToAction(
  data: Uint8Array | undefined,
  client: Client | undefined,
  apolloClient: ApolloClient<object>,
  network: SupportedNetworks
): Promise<ActionWithdraw | undefined> {
  if (!client || !data) {
    console.error('SDK client is not initialized correctly');
    return;
  }

  const decoded = client.decoding.withdrawAction(data);

  if (!decoded) {
    console.error('Unable to decode withdraw action');
    return;
  }

  const response = await fetchTokenData(
    decoded?.tokenAddress || constants.AddressZero,
    apolloClient,
    network
  );

  return {
    amount: Number(decoded.amount),
    name: 'withdraw_assets',
    to: decoded.recipientAddress,
    tokenAddress: response?.address || (decoded?.tokenAddress as string),
    tokenBalance: 0, // unnecessary
    tokenImgUrl: response?.imgUrl as string,
    tokenName: response?.name || '',
    tokenPrice: response?.price || 0,
    tokenSymbol: response?.symbol || '',
    isCustomToken: false,
  };
}
