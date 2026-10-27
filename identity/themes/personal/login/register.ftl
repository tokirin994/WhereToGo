<#import "template.ftl" as layout>
<#import "field.ftl" as field>
<#import "user-profile-commons.ftl" as userProfileCommons>
<#import "register-commons.ftl" as registerCommons>
<#import "password-validation.ftl" as validator>
<#-- Keep Keycloak's field renderer, validation, accessibility and password visibility controls. -->
<#macro personalAttribute attribute>
    <@field.group name=attribute.name label=advancedMsg(attribute.displayName!'') error=messagesPerField.get(attribute.name) required=attribute.required>
        <div class="${properties.kcInputWrapperClass!}">
            <@userProfileCommons.inputFieldByType attribute=attribute/>
            <#if attribute.annotations.inputHelperTextAfter??>
                <p class="personal-field-hint">${advancedMsg(attribute.annotations.inputHelperTextAfter)}</p>
            </#if>
        </div>
    </@field.group>
</#macro>
<@layout.registrationLayout displayMessage=messagesPerField.exists('global') displayRequiredFields=true; section>
<!-- template: register.ftl -->

    <#if section = "header">
        <#if messageHeader??>
            ${msg(messageHeader)}
        <#else>
            ${msg("registerTitle")}
        </#if>
    <#elseif section = "form">
        <form id="kc-register-form" class="${properties.kcFormClass!}" action="${url.registrationAction}" method="post" novalidate="novalidate">
            <p class="personal-form-intro">${msg("personalRegisterIntro")}</p>
            <#list profile.attributes as attribute>
                <#if attribute.name == 'locale' && realm.internationalizationEnabled>
                    <input type="hidden" name="locale" value="${locale.currentLanguageTag}"/>
                <#elseif attribute.name != 'firstName' && attribute.name != 'lastName'>
                    <@personalAttribute attribute/>
                </#if>
            </#list>
            <#if passwordRequired??>
                <@field.password name="password" required=true label=msg("password") autocomplete="new-password">
                    <p id="personal-password-hint" class="personal-field-hint">${msg("personalPasswordHint")}</p>
                </@field.password>
                <@field.password name="password-confirm" required=true label=msg("passwordConfirm") autocomplete="new-password" />
            </#if>
            <#assign nameFields = profile.attributes?filter(a -> a.name == 'firstName' || a.name == 'lastName')>
            <#if nameFields?has_content>
                <details class="personal-optional-fields" <#if nameFields?filter(a -> a.required)?has_content || messagesPerField.existsError('firstName','lastName')>open</#if>>
                    <summary>${msg("personalOptionalProfile")}</summary>
                    <div><#list nameFields as attribute><@personalAttribute attribute/></#list></div>
                </details>
            </#if>

            <@registerCommons.termsAcceptance/>

            <#if recaptchaRequired?? && (recaptchaVisible!false)>
                <div class="form-group">
                    <div class="${properties.kcInputWrapperClass!}">
                        <div class="g-recaptcha" data-size="compact" data-sitekey="${recaptchaSiteKey}" data-action="${recaptchaAction}"></div>
                    </div>
                </div>
            </#if>

            <#if recaptchaRequired?? && !(recaptchaVisible!false)>
                <script>
                    function onSubmitRecaptcha(token) {
                        document.getElementById("kc-register-form").requestSubmit();
                    }
                </script>
                <div id="kc-form-buttons" class="${properties.kcFormButtonsClass!}">
                    <button class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!} g-recaptcha"
                            data-sitekey="${recaptchaSiteKey}" data-callback="onSubmitRecaptcha" data-action="${recaptchaAction}" type="submit" id="kc-submit">
                        ${msg("doRegister")}
                    </button>
                </div>
            <#else>
                <div id="kc-form-buttons" class="${properties.kcFormButtonsClass!}">
                    <input class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!}" type="submit" value="${msg("doRegister")}"/>
                </div>
            </#if>

            <div class="${properties.kcFormGroupClass!} pf-v5-c-login__main-footer-band">
                <div id="kc-form-options" class="${properties.kcFormOptionsClass!} pf-v5-c-login__main-footer-band-item">
                    <div class="${properties.kcFormOptionsWrapperClass!}">
                        <span>${msg("personalHaveAccount")} <a href="${url.loginUrl}">${msg("doLogIn")}</a></span>
                    </div>
                </div>
            </div>

        </form>

        <@validator.templates/>
        <@validator.script field="password"/>
    </#if>
</@layout.registrationLayout>
