<?php

namespace App\Controller;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Annotation\Route;

class LpController extends AbstractController
{
    #[Route('/lp', name: 'lp_index')]
    public function index(): Response
    {
        return $this->render('lp/index.html.twig');
    }
}
