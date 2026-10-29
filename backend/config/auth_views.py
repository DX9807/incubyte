from django.contrib.auth import authenticate, login, logout
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.debug import sensitive_post_parameters
from drf_spectacular.utils import extend_schema
from rest_framework import permissions, status
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.response import Response
from rest_framework.views import APIView

from .auth_serializers import (
    CsrfTokenSerializer,
    LoginResponseSerializer,
    LoginSerializer,
    UserSerializer,
)


@method_decorator(never_cache, name='dispatch')
class CsrfTokenView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    @extend_schema(responses=CsrfTokenSerializer, auth=[])
    def get(self, request):
        return Response({'csrfToken': get_token(request._request)})


@method_decorator([never_cache, csrf_protect, sensitive_post_parameters('password')], name='dispatch')
class LoginView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    @extend_schema(request=LoginSerializer, responses=LoginResponseSerializer, auth=[],
                   description='Requires a CSRF cookie and token, including for anonymous login.')
    def post(self, request):
        credentials = LoginSerializer(data=request.data)
        credentials.is_valid(raise_exception=True)
        user = authenticate(request=request._request, **credentials.validated_data)
        if user is None or not user.is_active or not user.is_staff:
            raise AuthenticationFailed('Invalid credentials or account is not authorized.')
        login(request._request, user)
        return Response({'user': UserSerializer(user).data,
                         'csrfToken': get_token(request._request)})


@method_decorator(never_cache, name='dispatch')
class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(request=None, responses={204: None})
    def post(self, request):
        logout(request._request)
        return Response(status=status.HTTP_204_NO_CONTENT)


@method_decorator(never_cache, name='dispatch')
class MeView(APIView):
    @extend_schema(responses=UserSerializer)
    def get(self, request):
        return Response(UserSerializer(request.user).data)
