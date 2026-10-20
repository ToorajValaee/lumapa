<?php
/**
 * Plugin Name: Lumapa Stellar Pay for WooCommerce
 * Plugin URI: https://lumapa.ir
 * Description: Standards-first Stellar SEP-7 payment sessions for WooCommerce stores powered by badje.ir.
 * Version: 0.2.3
 * Author: badje.ir
 * Text Domain: lumapa-stellar-pay
 * Requires Plugins: woocommerce
 */

if (!defined('ABSPATH')) {
    exit;
}

add_action('plugins_loaded', 'lumapa_stellar_pay_init', 11);

function lumapa_stellar_pay_init() {
    if (!class_exists('WC_Payment_Gateway')) {
        return;
    }

    class WC_Gateway_Lumapa_Stellar_Pay extends WC_Payment_Gateway {
        public function __construct() {
            $this->id = 'lumapa_stellar_pay';
            $this->method_title = __('Lumapa Stellar Pay', 'lumapa-stellar-pay');
            $this->method_description = __('Accept Stellar payments through standard SEP-7 payment sessions. Supports Lumapa, public/testnet, and custom Stellar networks.', 'lumapa-stellar-pay');
            $this->has_fields = true;
            $this->supports = array('products');

            $this->init_form_fields();
            $this->init_settings();

            $this->title = $this->get_option('title');
            $this->description = $this->get_option('description');
            $this->enabled = $this->get_option('enabled');

            add_action('woocommerce_update_options_payment_gateways_' . $this->id, array($this, 'process_admin_options'));
            add_action('rest_api_init', array($this, 'register_rest_routes'));
            add_action('woocommerce_thankyou_' . $this->id, array($this, 'thankyou_page'));
            add_action('woocommerce_order_details_before_order_table', array($this, 'order_details_payment_check'));
        }

        public function init_form_fields() {
            $this->form_fields = array(
                'enabled' => array(
                    'title' => __('Enable/Disable', 'lumapa-stellar-pay'),
                    'type' => 'checkbox',
                    'label' => __('Enable Lumapa Stellar Pay', 'lumapa-stellar-pay'),
                    'default' => 'no'
                ),
                'title' => array(
                    'title' => __('Checkout title', 'lumapa-stellar-pay'),
                    'type' => 'text',
                    'default' => __('Pay with Stellar wallet', 'lumapa-stellar-pay'),
                    'desc_tip' => true
                ),
                'description' => array(
                    'title' => __('Checkout description', 'lumapa-stellar-pay'),
                    'type' => 'textarea',
                    'default' => __('After you place the order, a QR code and wallet-open button will appear for this exact Stellar payment. You can pay with Lumapa or any SEP-7 compatible Stellar wallet.', 'lumapa-stellar-pay')
                ),
                'checkout_base_url' => array(
                    'title' => __('Lumapa checkout URL', 'lumapa-stellar-pay'),
                    'type' => 'text',
                    'default' => 'https://lumapa.ir',
                    'description' => __('Your deployed Lumapa landing/checkout URL, without trailing slash. Do not use the wallet app URL here.', 'lumapa-stellar-pay')
                ),
                'merchant_id' => array(
                    'title' => __('Merchant ID', 'lumapa-stellar-pay'),
                    'type' => 'text',
                    'default' => sanitize_title(get_bloginfo('name')) ?: 'woocommerce-shop',
                    'description' => __('Stable shop identifier used in payment sessions. It is not secret.', 'lumapa-stellar-pay')
                ),
                'network_type' => array(
                    'title' => __('Network', 'lumapa-stellar-pay'),
                    'type' => 'select',
                    'default' => 'lumapa',
                    'options' => array(
                        'lumapa' => __('Lumapa private network', 'lumapa-stellar-pay'),
                        'public' => __('Stellar public network', 'lumapa-stellar-pay'),
                        'testnet' => __('Stellar testnet', 'lumapa-stellar-pay'),
                        'custom' => __('Custom Stellar network', 'lumapa-stellar-pay')
                    ),
                    'description' => __('Choose where this shop receives payments. For Custom, fill the custom network fields below.', 'lumapa-stellar-pay')
                ),
                'custom_network_id' => array(
                    'title' => __('Custom network ID', 'lumapa-stellar-pay'),
                    'type' => 'text',
                    'default' => '',
                    'description' => __('Only for Custom. Use a stable slug such as myshop-main. Lowercase letters, numbers, and hyphens only.', 'lumapa-stellar-pay')
                ),
                'custom_network_name' => array(
                    'title' => __('Custom network display name', 'lumapa-stellar-pay'),
                    'type' => 'text',
                    'default' => '',
                    'description' => __('Only for Custom. Human-friendly name shown on checkout.', 'lumapa-stellar-pay')
                ),
                'custom_horizon_url' => array(
                    'title' => __('Custom Horizon URL', 'lumapa-stellar-pay'),
                    'type' => 'text',
                    'default' => '',
                    'description' => __('Only for Custom. Example: https://horizon.example.com', 'lumapa-stellar-pay')
                ),
                'custom_network_passphrase' => array(
                    'title' => __('Custom network passphrase', 'lumapa-stellar-pay'),
                    'type' => 'textarea',
                    'default' => '',
                    'description' => __('Only for Custom. Must exactly match the Stellar Core network passphrase.', 'lumapa-stellar-pay')
                ),
                'custom_native_asset_code' => array(
                    'title' => __('Custom native asset code', 'lumapa-stellar-pay'),
                    'type' => 'text',
                    'default' => '',
                    'description' => __('Only for Custom. Example: BADJ, SHOP, or XLM. Use this also as Asset code when accepting the native asset.', 'lumapa-stellar-pay')
                ),
                'destination' => array(
                    'title' => __('Destination Stellar address', 'lumapa-stellar-pay'),
                    'type' => 'text',
                    'default' => '',
                    'description' => __('Merchant receiving G... account address on the selected network.', 'lumapa-stellar-pay')
                ),
                'asset_code' => array(
                    'title' => __('Accepted asset code', 'lumapa-stellar-pay'),
                    'type' => 'text',
                    'default' => 'BADJ',
                    'description' => __('For a native asset, enter its display code and leave issuer empty. For issued assets, enter the issued asset code.', 'lumapa-stellar-pay')
                ),
                'issuer' => array(
                    'title' => __('Asset issuer', 'lumapa-stellar-pay'),
                    'type' => 'text',
                    'default' => '',
                    'description' => __('Leave empty for native asset. Required only for issued assets.', 'lumapa-stellar-pay')
                ),
                'expires_minutes' => array(
                    'title' => __('Payment expiry minutes', 'lumapa-stellar-pay'),
                    'type' => 'number',
                    'default' => '15'
                )
            );
        }

        public function payment_fields() {
            if ($this->description) {
                echo wpautop(wp_kses_post($this->description));
            }
            echo '<div class="lumapa-stellar-pay-note" style="margin-top:10px;padding:12px;border:1px solid #ddd;border-radius:8px;background:#fafafa;">';
            echo '<strong>' . esc_html__('Next step', 'lumapa-stellar-pay') . '</strong><br />';
            echo esc_html__('Click Place order. Lumapa will then create the order-specific QR code and wallet link using the final amount, memo, and network settings.', 'lumapa-stellar-pay');
            echo '</div>';
        }

        private function get_checkout_base_url() {
            return rtrim(trim((string)$this->get_option('checkout_base_url')), '/');
        }

        private function get_network_payload() {
            $network_type = trim((string)$this->get_option('network_type')) ?: 'lumapa';
            if ($network_type !== 'custom') {
                return array(
                    'network' => $network_type,
                    'networkName' => $network_type === 'lumapa' ? 'Lumapa Network' : ($network_type === 'public' ? 'Stellar Public Network' : 'Stellar Testnet')
                );
            }

            $network_id = sanitize_title(trim((string)$this->get_option('custom_network_id')));
            $network_name = trim((string)$this->get_option('custom_network_name'));
            $horizon_url = rtrim(trim((string)$this->get_option('custom_horizon_url')), '/');
            $passphrase = trim((string)$this->get_option('custom_network_passphrase'));
            $native_asset_code = strtoupper(trim((string)$this->get_option('custom_native_asset_code')));

            if (!$network_id || !$network_name || !$horizon_url || !$passphrase || !$native_asset_code) {
                throw new Exception(__('Custom network is selected, but custom network ID, display name, Horizon URL, passphrase, and native asset code are required.', 'lumapa-stellar-pay'));
            }

            return array(
                'network' => $network_id,
                'networkName' => $network_name,
                'horizonUrl' => $horizon_url,
                'networkPassphrase' => $passphrase,
                'nativeAssetCode' => $native_asset_code
            );
        }

        public function register_rest_routes() {
            register_rest_route('lumapa-stellar-pay/v1', '/callback', array(
                'methods' => 'POST',
                'callback' => array($this, 'handle_payment_callback'),
                'permission_callback' => '__return_true'
            ));
        }

        private function mark_order_paid($order, $session_id, $transaction_hash) {
            if (!$order) {
                return false;
            }
            if ($session_id) {
                $order->update_meta_data('_lumapa_stellar_payment_session_id', sanitize_text_field($session_id));
            }
            if ($transaction_hash) {
                $order->update_meta_data('_lumapa_stellar_transaction_hash', sanitize_text_field($transaction_hash));
            }
            if (!$order->is_paid()) {
                $order->payment_complete($transaction_hash ?: 'lumapa-stellar');
                $order->add_order_note(sprintf(__('Lumapa Stellar payment verified. Transaction: %s', 'lumapa-stellar-pay'), $transaction_hash ?: 'unknown'));
            }
            $order->save();
            return true;
        }

        private function verify_order_with_lumapa($order) {
            if (!$order || $order->is_paid()) {
                return $order && $order->is_paid();
            }
            $session_id = (string)$order->get_meta('_lumapa_stellar_payment_session_id');
            if (!$session_id) {
                return false;
            }
            $checkout_base = $this->get_checkout_base_url();
            if (!$checkout_base) {
                return false;
            }
            $response = wp_remote_post($checkout_base . '/api/payment-sessions/' . rawurlencode($session_id) . '/verify', array(
                'timeout' => 20
            ));
            if (is_wp_error($response)) {
                $order->add_order_note('Lumapa payment status check failed: ' . $response->get_error_message());
                $order->save();
                return false;
            }
            $code = wp_remote_retrieve_response_code($response);
            $body = json_decode(wp_remote_retrieve_body($response), true);
            if ($code >= 200 && $code < 300 && isset($body['status']) && $body['status'] === 'paid') {
                return $this->mark_order_paid($order, $session_id, isset($body['transactionHash']) ? $body['transactionHash'] : '');
            }
            return false;
        }

        public function thankyou_page($order_id) {
            $order = wc_get_order($order_id);
            if (!$order) {
                return;
            }
            if ($this->verify_order_with_lumapa($order)) {
                echo '<p class="woocommerce-message">' . esc_html__('Lumapa payment confirmed on the Stellar ledger.', 'lumapa-stellar-pay') . '</p>';
            } elseif ((string)$order->get_meta('_lumapa_stellar_payment_session_id')) {
                echo '<p class="woocommerce-info">' . esc_html__('Lumapa payment is still being verified. Refresh this page in a few seconds if the status does not update.', 'lumapa-stellar-pay') . '</p>';
            }
        }

        public function order_details_payment_check($order) {
            if ($order && $order->get_payment_method() === $this->id) {
                $this->verify_order_with_lumapa($order);
            }
        }

        public function handle_payment_callback($request) {
            $payload = $request->get_json_params();
            $session_id = isset($payload['sessionId']) ? sanitize_text_field($payload['sessionId']) : '';
            $status = isset($payload['status']) ? sanitize_text_field($payload['status']) : '';
            $transaction_hash = isset($payload['transactionHash']) ? sanitize_text_field($payload['transactionHash']) : '';

            if (!$session_id || $status !== 'paid') {
                return new WP_REST_Response(array('ok' => false, 'message' => 'Ignored callback.'), 202);
            }

            $orders = wc_get_orders(array(
                'limit' => 1,
                'meta_key' => '_lumapa_stellar_payment_session_id',
                'meta_value' => $session_id,
                'return' => 'objects'
            ));

            if (empty($orders)) {
                return new WP_REST_Response(array('ok' => false, 'message' => 'Order not found.'), 404);
            }

            $order = $orders[0];
            $this->mark_order_paid($order, $session_id, $transaction_hash);

            return new WP_REST_Response(array('ok' => true), 200);
        }

        public function process_payment($order_id) {
            $order = wc_get_order($order_id);
            if (!$order) {
                wc_add_notice(__('Invalid order.', 'lumapa-stellar-pay'), 'error');
                return array('result' => 'failure');
            }

            $checkout_base = $this->get_checkout_base_url();
            $destination = trim($this->get_option('destination'));
            if (!$checkout_base || !$destination) {
                wc_add_notice(__('Lumapa Stellar Pay is not configured.', 'lumapa-stellar-pay'), 'error');
                return array('result' => 'failure');
            }

            try {
                $network_payload = $this->get_network_payload();
            } catch (Exception $e) {
                wc_add_notice($e->getMessage(), 'error');
                return array('result' => 'failure');
            }

            $expires_minutes = max(1, intval($this->get_option('expires_minutes')));
            $payload = array_merge($network_payload, array(
                'merchantId' => $this->get_option('merchant_id'),
                'orderId' => (string)$order->get_order_number(),
                'destination' => $destination,
                'amount' => wc_format_decimal($order->get_total(), 7),
                'assetCode' => strtoupper(trim($this->get_option('asset_code')) ?: 'XLM'),
                'issuer' => trim($this->get_option('issuer')) ?: null,
                'memo' => substr((string)$order->get_order_number(), 0, 28),
                'expiresAt' => gmdate('Y-m-d\TH:i:s\Z', time() + ($expires_minutes * 60)),
                'callbackUrl' => rest_url('lumapa-stellar-pay/v1/callback'),
                'returnUrl' => $order->get_checkout_order_received_url()
            ));

            $response = wp_remote_post($checkout_base . '/api/payment-sessions', array(
                'headers' => array('Content-Type' => 'application/json'),
                'body' => wp_json_encode($payload),
                'timeout' => 20
            ));

            if (is_wp_error($response)) {
                wc_add_notice($response->get_error_message(), 'error');
                return array('result' => 'failure');
            }

            $code = wp_remote_retrieve_response_code($response);
            $body = json_decode(wp_remote_retrieve_body($response), true);
            if ($code < 200 || $code >= 300 || empty($body['id'])) {
                wc_add_notice(__('Could not create Stellar payment session.', 'lumapa-stellar-pay'), 'error');
                return array('result' => 'failure');
            }

            $order->update_meta_data('_lumapa_stellar_payment_session_id', sanitize_text_field($body['id']));
            $order->update_meta_data('_lumapa_stellar_uri', esc_url_raw($body['stellarUri']));
            $order->update_status('on-hold', __('Awaiting standard Stellar URI payment through Lumapa Stellar Pay.', 'lumapa-stellar-pay'));
            $order->save();

            WC()->cart->empty_cart();

            return array(
                'result' => 'success',
                'redirect' => $checkout_base . '/pay/' . rawurlencode($body['id'])
            );
        }
    }

    add_filter('woocommerce_payment_gateways', function($gateways) {
        $gateways[] = 'WC_Gateway_Lumapa_Stellar_Pay';
        return $gateways;
    });
}
